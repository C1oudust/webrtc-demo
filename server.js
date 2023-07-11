const server = require('http').createServer();
const io = require('socket.io')(server);

const userMap = new Map(); // user - >  socket 保存用户socket
const roomKey = 'meeting-room::';
const rooms = new Map(); // rooms => Set() 保存当前room下的userId
io.on('connection', async (socket) => {
  await onListener(socket);
});

server.listen(18080, async () => {
  console.log('服务器启动成功 *:18080');
});

function getMsg(type, msg, status = 200, data = null) {
  return { type: type, msg: msg, status: status, data: data };
}

// 监听socket 信令服务器
async function onListener(s) {
  let { userId, roomId, nickname } = s.handshake.query;
  console.log('client uid：' + userId + ' roomId: ' + roomId + ' 加入 ');
  userMap.set(userId, s); // TODO 缓存用户所有信息
  if (roomId) {
    let key = roomKey + roomId;
    if (!rooms.get(key)) {
      rooms.set(key, new Set());
    }
    let users = rooms.get(key);
    users.add(userId);
    rooms.set(key, users);
    oneToRoomMany(roomId, getMsg('join', userId + '加入房间', 200, userId));
  }

  s.on('msg', async (data) => {
    console.log('msg', data);
    await oneToRoomMany(roomId);
  });

  s.on('disconnect', () => {
    console.log('uid：' + userId + ' roomId: ' + roomId + ' 离开 ');
    userMap.delete(userId);
    if (roomId) {
      let key = roomKey + roomId;
      if (!rooms.get(key)) return;
      let users = rooms.get(key);
      users.delete(userId);
      rooms.set(key, users);
      oneToRoomMany(roomId, getMsg('leave', userId + '离开房间', 200, userId));
    }
  });

  s.on('roomUserList', async (data) => {
    let userSet = await getRoomUser(data['roomId']);
    s.emit('roomUserList', [...userSet]);
  });
  s.on('call', (data) => {
    let targetUid = data['targetUid'];
    if (userMap.get(targetUid)) {
      oneToOne(targetUid, getMsg('call', '远程呼叫', 200, data));
    } else {
      console.log(targetUid + '不在线');
    }
  });
  s.on('candidate', (data) => {
    let targetUid = data['targetUid'];
    if (userMap.get(targetUid)) {
      oneToOne(targetUid, getMsg('candidate', 'ice candidate', 200, data));
    } else {
      console.log(targetUid + '不在线');
    }
  });
  s.on('offer', (data) => {
    let targetUid = data['targetUid'];
    if (userMap.get(targetUid)) {
      oneToOne(targetUid, getMsg('offer', 'rtc offer', 200, data));
    } else {
      console.log(targetUid + '不在线');
    }
  });
  s.on('answer', (data) => {
    let targetUid = data['targetUid'];
    if (userMap.get(targetUid)) {
      oneToOne(targetUid, getMsg('answer', 'rtc answer', 200, data));
    } else {
      console.log(targetUid + '不在线');
    }
  });
}

function oneToOne(uid, msg) {
  let s = userMap.get(uid);
  if (s) {
    s.emit('msg', msg);
  } else {
    console.log(uid + '用户不在线');
  }
}
// 获取房间中的用户
async function getRoomUser(roomId) {
  return rooms.get(roomKey + roomId);
}

async function oneToRoomMany(roomId, msg) {
  let ulist = [...rooms.get(roomKey + roomId)];
  for (let i = 0; i < ulist.length; i++) {
    const uid = ulist[i];
    oneToOne(uid, msg);
  }
}
