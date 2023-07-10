const server = require('http').createServer();
const io = require('socket.io')(server);

const userMap = new Map(); // user - > socket
const roomKey = 'meeting-room::';
const rooms = new Map(); // rooms => Set() set存储当前room下的userId
io.on('connection', async (socket) => {
  await onListener(socket);
});

server.listen(18080, async () => {
  console.log('服务器启动成功 *:18080');
});

function getMsg(type, msg, status = 200, data = null) {
  return { type: type, msg: msg, status: status, data: data };
}

function getParams(url, queryName) {
  let query = decodeURI(url.split('?')[1]);
  let vars = query.split('&');
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split('=');
    if (pair[0] === queryName) {
      return pair[1];
    }
  }
  return null;
}

async function getUserDetailByUid(userId, roomId) {
  let res = JSON.stringify({ userId: userId, roomId: roomId });
  console.log(res);
  return res;
}

// 监听socket 信令服务器
async function onListener(s) {
  let url = s.client.request.url;
  let userId = getParams(url, 'userId');
  let roomId = getParams(url, 'roomId');
  console.log('client uid：' + userId + ' roomId: ' + roomId + ' online ');
  //user map
  userMap.set(userId, s);
  //room cache
  if (roomId) {
    let key = roomKey + roomId;
    if (!rooms.get(key)) {
      rooms.set(key, new Set());
    }
    let users = rooms.get(key);
    users.add(userId);
    rooms.set(key, users);
    // console.log(rooms);
    oneToRoomMany(roomId, getMsg('join', userId + ' join then room', 200, userId));
  }

  s.on('msg', async (data) => {
    console.log('msg', data);
    await oneToRoomMany(roomId);
  });

  s.on('disconnect', () => {
    console.log('client uid：' + userId + ' roomId: ' + roomId + ' offline ');
    userMap.delete(userId);
    if (roomId) {
      let key = roomKey + roomId;
      if (!rooms.get(key)) return;
      let users = rooms.get(key);
      users.delete(userId);
      rooms.set(key, users);
      oneToRoomMany(roomId, getMsg('leave', userId + ' leave the room ', 200, userId));
    }
  });

  s.on('roomUserList', async (data) => {
    // console.log("roomUserList msg",data)
    s.emit('roomUserList', await getRoomUser(data['roomId']));
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
