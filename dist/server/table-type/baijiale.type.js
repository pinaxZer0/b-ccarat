'use strict';
var TableBase=require('./tablebase.js');
var async=require('async'), merge=require('merge'), clone=require('clone');
var Game=require('./gamerule');
var debugout=require('debugout')(require('yargs').argv.debugout);
var _=require('lodash');
var getDB=require('../db.js'), g_db=null;
getDB(function(err, db) {
	if (!err) g_db=db;
});
var initSrvStat=require('../servers.js'),srv_state={};
initSrvStat(function(err, s) {
	if (!err) srv_state=s;
})

const GAME_STATUS={
	KAIJU:1,
	FAPAI:2,
	QIEPAI:0,
};
class Baijiale extends TableBase {
	constructor(roomid, type, opt) {
		super(roomid, type, opt);
		this.roomid=roomid;
		this.profits=[];
		this.profits.sum=0;
		// this._quitList=[];
		this.roomtype='baccarat';
		this.gamedata.opt=merge({minZhu:10, maxZhu:7500, minDui:1, maxDui:750, maxHe:950}, opt);
		this.opt=this.gamedata.opt;
		this.gamedata.roomid=roomid;
		this.gamedata.his=[];
		this.gamedata.seats={};
		var game=this.gamedata.game=new Game();
		var self=this;
		game.on('burn', function(detail) {
			self.broadcast({c:'table.baccarat.burn', detail});
		})
		.on('result', function(detail) {
			detail.playerCard=game.player.cards;
			detail.bankerCard=game.banker.cards;
			self.gamedata.his.push(detail);
		});

		this.msgDispatcher.on('userquit', this.countOnline.bind(this));
		this.run();
	}
	countOnline() {
		this.gamedata.online=Object.keys(this.gamedata.seats).length;
	}
	get onlineCount() {
		return this.gamedata.online;
	}
	tryAutoDismiss() {}
	canEnter(user) {
		return true;
	}
	enter(user) {
		if (this.quitTimer) clearTimeout(this.quitTimer);
		var seat=null, gd=this.gamedata;

		if (!gd.seats[user.id]) {
			gd.seats[user.id]={user:user}; 
			this.countOnline();
		}
		var o=this.mk_transfer_gamedata(this.gamedata);
		var gamedata=o.gamedata||o.scene;
		gamedata.$={init:true};
		o.seq=1;
		user.send(o);
		this.broadcast({c:'table.userin', id:user.id, nickname:user.nickname, level:user.level, face:user.dbuser.face, seat:seat});
		user.offline=false;
		this.msgDispatcher.emit('userin', user);
		// if (emptyseat==1) this.run();		
	}
	// quit(user) {
	// 	this._quitList.push(user);
	// }
	mk_transfer_gamedata(obj, idx) {
		// 简化user对象，只传输id nickname face level score
		//console.log(JSON.stringify(obj));
		var self = this;
		if (!obj.deal && !obj.seats) return {scene:obj};
		obj=clone(obj);
		if (obj.deal) {
			for (var i in obj.deal) {
				delete obj.deal[i].user;
			}
		}
		if (obj.seats) {
			for (var i in obj.seats) {
				var seat =obj.seats[i];
				if (!seat) continue;
				var u=this.scene.seats[i].user;
				if (u) {
					seat.user={id:u.id, nickname:u.nickname, face:u.dbuser.face, coins:u.coins, level:u.level, offline:seat.offline};
				}
			}
		}
		return {scene:obj};
	}
	newgame() {
		debugout(this.gamedata.roomid, 'new game');
		this.gamedata.setnum=0;
		this.gamedata.his=[];
		this.q.push(this.qiepai.bind(this));
		this.newround();
	}
	newround() {
		debugout(this.gamedata.roomid, 'new round');
		this.q.push([
			this.waitXiazhu.bind(this),
			this.fapai.bind(this),
			this.jiesuan.bind(this)
		]);
	}
	run() {
		var self = this;
		// loop
		this.q = async.queue(function(task, cb) {
			if (typeof task=='function') return task(cb);
			cb();
		});

		this.q.push([
			this.waitUserEnter.bind(this),
		],function(err) {

		});
		this.newgame();
	}
	waitUserEnter(cb) {
		// var self=this;
		this.msgDispatcher.once('userin', function() {
			// self.scene.testarr=[1, 2, 3, 4, 5,6];
			// setTimeout(function() {
			// 	self.scene.testarr=[1];
			// })
			cb();
		});
	}
	qiepai(cb) {
		debugout(this.roomid, 'qiepai');
		// 找到所有在线的玩家，随机选一个人来切牌
		var self=this;
		this.gamedata.status=GAME_STATUS.QIEPAI;
		var vus=this.allusers(true);
		var choose=Math.floor(Math.random()*vus.length);
		debugout(vus, choose);
		var u=vus[choose];
		if (!u) {
			self.gamedata.game.begin();
			return cb();
		}
		u.createInteract({c:'table.waitQiepai'}, {times:1, timeout:5})
		.on('ans', function(pack) {
			self.broadcast(pack, vus[choose]);
		})
		.on('final', function() {
			self.gamedata.game.begin();
			cb();
		});
	}
	waitXiazhu(callback) {
		debugout(this.roomid, 'waitXiazhu');
		var self=this, gd=this.gamedata;
		this.gamedata.status=GAME_STATUS.KAIJU;
		// var vus=this.allusers(true);
		gd.deal={};
		var total={xian:0, xianDui:0, zhuang:0, zhuangDui:0, he:0};
		function handleXiazhu(pack, user) {
			var deal=gd.deal[user.id];
			if (!deal) {
				gd.deal[user.id]={xianDui:0, zhuangDui:0, he:0, xian:0, zhuang:0, user:user};
				deal=gd.deal[user.id];
			}
			if (deal.sealed) return;
			console.log(pack, total);
			if (pack.xian) {
				if (pack.xian<gd.opt.minZhu) return user.send({err:'最少下注'+gd.opt.minZhu});
				if (pack.xian>gd.opt.maxZhu) return user.send({err:'最多下注'+gd.opt.maxZhu});
				if (user.coins<pack.xian) return user.send({err:{message:'金币不足，请充值', win:'RechargeWin'}});
				if ((total.xian+pack.xian)>=(total.zhuang+gd.opt.maxZhu/3)) return user.send({err:'不能继续压闲'});
				deal.xian+=pack.xian;
				total.xian+=pack.xian;
				user.coins-=pack.xian;
			}
			else if (pack.zhuang) {
				if (pack.zhuang<gd.opt.minZhu) return user.send({err:'最少下注'+gd.opt.minZhu});
				if (pack.zhuang>gd.opt.maxZhu) return user.send({err:'最多下注'+gd.opt.maxZhu});
				if (user.coins<pack.zhuang) return user.send({err:{message:'金币不足，请充值', win:'RechargeWin'}});
				if ((total.zhuang+pack.zhuang)>=(total.xian+gd.opt.maxZhu/3)) return user.send({err:'不能继续压庄'});
				deal.zhuang+=pack.zhuang;
				total.zhuang+=pack.zhuang;
				user.coins-=pack.zhuang;
			}
			else if (pack.he) {
				if (pack.he<gd.opt.minDui) return user.send({err:'最少下注'+gd.opt.minDui});
				if (user.coins<pack.he) return user.send({err:{message:'金币不足，请充值', win:'RechargeWin'}});
				if ((total.he+pack.he)>=gd.opt.maxHe) return user.send({err:'不能继续压和'});
				deal.he+=pack.he;
				total.he+=pack.he;
				user.coins-=pack.he;
			}
			else if (pack.xianDui) {
				if (pack.xianDui<gd.opt.minDui) return user.send({err:'最少下注'+gd.opt.minDui});
				if (user.coins<pack.xianDui) return user.send({err:{message:'金币不足，请充值', win:'RechargeWin'}});
				if ((total.xianDui+pack.xianDui)>=gd.opt.maxDui) return user.send({err:'不能继续压闲对'});
				deal.xianDui+=pack.xianDui;
				total.xianDui+=pack.xianDui;
				user.coins-=pack.xianDui;
			}
			else if (pack.zhuangDui) {
				if (pack.zhuangDui<gd.opt.minDui) return user.send({err:'最少下注'+gd.opt.minDui});
				// if (pack.zhuangDui>gd.opt.maxZhu) return user.send({err:'最多下注'+gd.opt.maxZhu});				
				if (user.coins<pack.zhuangDui) return user.send({err:{message:'金币不足，请充值', win:'RechargeWin'}});
				if ((total.zhuangDui+pack.zhuangDui)>=gd.opt.maxDui) return user.send({err:'不能继续压庄对'});
				deal.zhuangDui+=pack.zhuangDui;
				total.zhuangDui+=pack.zhuangDui;
				user.coins-=pack.zhuangDui;
			}			
		}
		function handleCancelXiazhu(pack, user) {
			var deal=gd.deal[user.id];
			if (!deal) return;
			if (deal.sealed) return;
			total.xianDui-=deal.xianDui;
			total.zhuangDui-=deal.zhuangDui;
			total.he-=deal.he;
			total.xian-=deal.xian;
			total.zhuang-=deal.zhuang;
			var reback=(deal.xian||0)+(deal.xianDui||0)+(deal.zhuangDui||0)+(deal.he||0)+(deal.zhuang||0);
			deal.user.coins+=reback;
			deal.xian=deal.xianDui=deal.zhuangDui=deal.he=deal.zhuang=0;
			// delete gd.deal[user.id];
		}
		function handleConfirmXiazhu(pack, user) {
			var deal=gd.deal[user.id];
			if (!deal) return;
			deal.sealed=true;
		}
		gd.countdown=24;
		var timer=setInterval(function() {
			gd.countdown--;
			if (gd.countdown==-1) {
				clearInterval(timer);
				self.msgDispatcher.removeListener('table.xiazhu',handleXiazhu)
				.removeListener('table.cancelXiazhu',handleCancelXiazhu)
				.removeListener('table.confirmXiazhu',handleConfirmXiazhu);
				callback();
			}
		}, 1000);
		this.msgDispatcher.on('table.xiazhu', handleXiazhu)
		.on('table.cancelXiazhu', handleCancelXiazhu)
		.on('table.confirmXiazhu', handleConfirmXiazhu)
		// async.each(vus, function(user, cb) {
		// 	var deal=user.deal={xianDui:0, zhuangDui:0, he:0, xian:0, zhuang:0};
		// 	user.createInteract({c:'table.xiazhu'}, {ans:'table.confirmXiazhu', times:1, timeout:24*1000})
		// 	.on('final', function() {
		// 		user.deal=deal;
		// 		cb(null, deal);
		// 	})
		// 	.on('other', function(pack) {
		// 		switch(pack.c) {
		// 			case 'table.xiazhu':
		// 				deal.xianDui+=pack.xianDui;
		// 				deal.zhuangDui+=pack.zhuangDui;
		// 				deal.he+=pack.he;
		// 				deal.xian+=pack.xian;
		// 				deal.zhuang+=pack.zhuang;
		// 				//deal.delta=pack;

		// 				gd.xianDui+=pack.xianDui;
		// 				gd.zhuangDui+=pack.zhuangDui;
		// 				gd.he+=pack.he;
		// 				gd.xian+=pack.xian;
		// 				gd.zhuang+=pack.zhuang;
		// 				gd.delta=pack;
		// 			break;
		// 			case 'table.cancelXiazhu':
		// 				gd.xianDui-=deal.xianDui;
		// 				gd.zhuangDui-=deal.zhuangDui;
		// 				gd.he-=deal.he;
		// 				gd.xian-=deal.xian;
		// 				gd.zhuang-=deal.zhuang;
		// 				gd.delta={xianDui:-deal.xianDui, zhuangDui:deal.zhuangDui, he:-deal.he, xian:-deal.xian, zhuang:-deal.zhuang};
		// 				deal={xianDui:0, zhuangDui:0, he:0, xian:0, zhuang:0};		
		// 			break;
		// 		}
		// 	});
		// },
		// function(err, r) {
		// 	callback();
		// })
	}
	fapai(cb) {
		this.gamedata.status=GAME_STATUS.FAPAI;
		this.gamedata.game.once('result', function() {
			setTimeout(function() {cb()}, 100);
		});
		this.gamedata.game.playHand();
	}
	jiesuan(cb) {
		debugout(this.roomid, 'jiesuan');
		this.gamedata.status=0;
		var profit=0;
		var factor={xian:1, zhuang:0.95, xianDui:11, zhuangDui:11, he:8};
		var self=this, gd=this.gamedata;
		var r=gd.his[gd.his.length-1];
		var winArr=[];
		if (r.win=='banker') {
			winArr.push('zhuang');
		}
		if (r.win=='player') {
			winArr.push('xian');
		}
		if (r.win=='tie') {
			winArr.push('he');
		}
		if (r.playerPair) {
			winArr.push('xianDui');
		}
		if (r.bankerPair) {
			winArr.push('zhuangDui');
		}
		var params=winArr.slice();
		params.unshift(['zhuang', 'xian', 'he', 'xianDui', 'zhuangDui']);
		var loseArr=_.without.apply(_, params);

		var now=new Date();
		for (var k in gd.deal) {
			var deal=gd.deal[k];
			var orgCoins=deal.user.coins;
			for (var i=0;i<winArr.length; i++) {
				var usercoins=deal[winArr[i]]
				if (!usercoins) continue;
				var delta=usercoins*factor[winArr[i]];
				deal.user.coins+=(delta+usercoins);
				profit-=delta;
			}
			for (var i=0; i<loseArr.length; i++) {
				profit+=(deal[loseArr[i]]||0);
			}
			var newCoins=deal.user.coins;
			delete deal.user;
			g_db.games.insert({user:k, deal:deal, r:r, oldCoins:orgCoins, newCoins:newCoins, t:now});
		}
		this.profits.push({profit:profit, t:now, set:gd.setnum});
		this.profits.sum+=profit;
		srv_state.total_profit+=profit;

		// if (this._quitList.length>0) {
		// 	for (var i=0; i<this._quitList.length; i++) super.quit(this._quitList[i]);
		// 	this._quitList=[];
		// }

		gd.setnum++;
		(function(next) {
			if (self.allusers().length==0) {
				debugout(self.roomid, 'no enough user');
				// wait user enter to continue
				self.msgDispatcher.once('userin', function() {
					next();
				});
			}
			else next();
		})(function() {
			if (gd.game.leftCards<14) {
			// if (gd.setnum>=3) {
				self.newgame();
			}else self.newround();
			setTimeout(cb, 7*1000);
		});
	}
}

module.exports=Baijiale;