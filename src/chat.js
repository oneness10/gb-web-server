const socketio = require('socket.io')
const Redis = require('ioredis')

const cmn = require('./common')

/*--------------------------------------------------*/
//#region Sub

// Redis Sub
const redisSub = new Redis({
  port: 6379,
  host: process.env.REDIS_SERVER,
})
// Sub接続
redisSub.on('connect', () => {
  console.log('Redis Chat Sub connection successful')
})
// Sub切断
redisSub.on('disconnect', () => {
  console.log('Redis Chat Sub disconnected')
})
// Sub終了
redisSub.on('end', () => {
  console.log('Redis Chat Sub end')
})
// Subワーニング
redisSub.on("warning", (warning) => {
  console.log(`Redis Chat Sub warning:${warning}`)
})
// Subエラー
redisSub.on('error', (err) => {
  console.log(`Redis Chat Sub error:${err}`)
})

// Subメッセージ
redisSub.on('message', (ip, data) => {
  const d = JSON.parse(data)
  console.log(`Redis >> Sub '${ip}' data:${JSON.stringify(d)}`)

  const room = d.m
  console.log(`ルームチェック rooms:`, io.of(cmn.CHAT_NAME).adapter.rooms)
  
  // ルーム存在チェック
  if (io.of(`/${cmn.CHAT_NAME}`).adapter.rooms.has(room)) {
    // データ送信
    console.log(`Chat emit to:${room} data:${JSON.stringify(d)}`)
    setTimeout(() => io.of(cmn.CHAT_NAME).to(room).emit('msg', d), 5)
  }
})

// Subセット
const setSub = () => {
  const channel = cmn.IP_ADDRESS
  // Subscribe
  redisSub.subscribe(channel, (err, count) => {
    if (err) {
      console.error(`Redis Chat Sub subscribe channel:'${channel}' error:${err.message}`)
    }
    // } else {
    //   console.log(`Redis Chat Sub subscribe channel:'${channel}' count:${count}`)
    // }
  })
}

// 初回Subセット
setSub()
// Subタイマー(Subの維持)
const subTimer = setInterval(() => setSub(), (cmn.SUB_TIMEOUT_SEC) * 1000)

//#endregion

/*--------------------------------------------------*/
//#region Resisクライント

// Resisクライント
const redisClient = new Redis({
  port: 6379,
  host: process.env.REDIS_SERVER,
})
// Resisクライント接続
redisClient.on('connect', () => {
  console.log('Redis Chat Client connection successful')
})
// Resisクライント切断
redisClient.on('disconnect', () => {
  console.log('Redis Chat Client disconnected')
})
// Resisクライント終了
redisClient.on('end', () => {
  console.log('Redis Chat Client end')
})
// Resisクライントワーニング
redisClient.on("warning", (warning) => {
  console.log(`Redis Chat Client warning:${warning}`)
})
// Resisクライントエラー
redisClient.on('error', (err) => {
  console.log(`Redis Chat Client error:${err}`)
})

redisClient.set(`con:${cmn.IP_ADDRESS}`, `0` )
redisClient.set(`rm:${cmn.IP_ADDRESS}`, `0` )

// サーバー接続数セット
const setServerConnectCount = (socket) => {

  const count = socket.client.conn.server.clientsCount
  console.log(`Server:${cmn.IP_ADDRESS} 接続数:${count}`)

  //　サーバー接続数書き込み
  redisClient.set(`con:${cmn.IP_ADDRESS}`, `${count}`)
}

// サーバールーム数セット
const setServerRoomCount = async () => {
  try {
    // 接続数
    const connectCount = await redisClient.get(`con:${cmn.IP_ADDRESS}`)
    let connectCountNumber = (connectCount) ? Number(connectCount) : 0

    // ルーム数
    const count = `${io.of(cmn.CHAT_NAME).adapter.rooms.size - connectCountNumber}`
    console.log(`Server:${cmn.IP_ADDRESS} ルーム数${count}`)
    // サーバールーム数書き込み
    redisClient.set(`rm:${cmn.IP_ADDRESS}`, `${count}`)
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

// データ送信
const sendData = async (room, data) => {
  try {
    const ipList = await redisClient.smembers(`sv:${room}`)
    ipList.map(ip => {
      // Publishメッセージ
      console.log(`Redis Chat Client >> Pub channel:'${ip}' data:${JSON.stringify(data)}`)
      redisClient.publish(ip, JSON.stringify(data))
    })
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

// メッセージデータセット
const sendMessageData = (message, type) => {
  const t = `m${type}`
  sendData(message.mid, { t:t, u:message.utime, m:message.mid })
}

// コメントデータセット
const sendCommentData = (comment, type) => {
  const t = `c${type}`
  sendData(comment.mid, { t:t, u:comment.utime, m:comment.mid, c:comment.cid })
}

// ルームに入る
const inRoom = async (room, key) => {
  // ルームメンバーにキーを登録、有効期間をセット
  console.log(`Room メンバー登録 ルーム:member:${room} key:${key} 有効期限:${cmn.ROOMKEEP_SEC + 5}`)
  redisClient.pipeline().sadd(`mem:${room}`, key).expire(`mem:${room}`, cmn.ROOMKEEP_SEC + 5).exec()
}

// ルームを出る
const outRoom = async (room, key) => {
  // ルームメンバーのキーを削除
  console.log(`Room メンバー削除 ルーム:member:${room} key:${key}`)
  await redisClient.srem(`mem:${room}`, key)
  
  // ルーム削除チェック
  checkDeleteRoom(room)
}

// ルームチャットが可能かチェック
const checkRoomChat = async (room, key) => {
  try {
    // メンバー数習得
    const memberCount = await redisClient.scard(`mem:${room}`)

    // ルームメンバーを見て複数ならtrueを返す、無しまたは1つならfalseを返す、1つの場合keyでなければtrue
    let isChat = false
    if (memberCount >= 1) {
      if (memberCount === 1) {
        const isMember = await redisClient.sismember(`mem:${room}`, key)
        if (!isMember) isChat = true
      } else {
        isChat = true
      }
    }

    console.log(`Room ルームチャットチェック ルーム:member:${room} key:${key} メンバー数:${memberCount} チャット可:${isChat}`)
      
    return isChat
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return false
}

// ルーム削除チェック
const checkDeleteRoom = async (room) => {
  try {
    const memberCount = await redisClient.scard(`mem:${room}`)

    let isDelete = false
    if (memberCount <= 1) {
      console.log(`Room ルーム削除チェック ルーム:${room}:member 削除`)

      // チャット切断
      sendData(room, { t:'re', m:room })

      isDelete = true
    }
    
    return isDelete
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return false
}

//#endregion

/*--------------------------------------------------*/
//#region Web Socket

let io = null

// 初期化
const init = (server) => {

  // WebSocketサーバーの起動
  io = socketio(server)
  
  // WebSocketクライアントが接続してきた時の処理
  io.of(cmn.CHAT_NAME).on('connection', (socket) => {
    
    console.log(`Chat 接続 id:${socket.id}`)
    // ルーム再セット
    console.log(`Chat emit ルーム再セット送信 >> ${socket.id}`)
    setTimeout(() => io.of(cmn.CHAT_NAME).to(socket.id).emit('msg', { 't':'rr' }), 5)

    // サーバー接続数セット
    setServerConnectCount(socket)

    // 切断
    socket.on('disconnect', (data) => {
      console.log(`Chat 切断 id:${socket.id} ${data}`)
      // サーバー接続数セット
      setServerConnectCount(socket)
    })

    // ルームに入る
    socket.on('ir', (data) => {
      if ('r' in data) {
        console.log(`Chat 受信 /${cmn.CHAT_NAME} ir data:{r:${data.r}}`)

        const room = `${data.r}`
        socket.join(room)

        // サーバールーム数セット
        setServerRoomCount()
      }
    })

    // ルームから出る
    socket.on('or', (data) => {
      if ('r' in data) {
        console.log(`Chat 受信 /${cmn.CHAT_NAME} or data:{r:${data.r}}`)

        const room = `${data.r}`
        socket.leave(room)

        // サーバールーム数セット
        setServerRoomCount()
      }
    })
  })

  // ルーム作成
  io.of(cmn.CHAT_NAME).adapter.on("create-room", (room) => {
    //console.log(`Chat ルーム作成 room:${room}`)
  })
  
  // ルームに入る
  io.of(cmn.CHAT_NAME).adapter.on("join-room", (room, id) => {
    if (room !==  id) {
      console.log(`Chat ルームに入る room:${room} <<< id:${id} `)
      console.log(`Chat room:${room} =>`, io.of(cmn.CHAT_NAME).adapter.rooms.get(room))

      if (io.of(cmn.CHAT_NAME).adapter.rooms.get(room).size === 1) {
        // ルームサーバーにサーバーを登録
        console.log(`Room サーバー登録 ルーム:server:${room} サーバー:${cmn.IP_ADDRESS}`)
        redisClient.sadd(`sv:${room}`, cmn.IP_ADDRESS)
      }
    }
  })

  // ルームから出る
  io.of(cmn.CHAT_NAME).adapter.on("leave-room", (room, id) => {
    if (room !==  id) {

      console.log(`Chat ルームから出る room:${room} >>> id:${id} `)
      console.log(`Chat room:${room} =>`, io.of(cmn.CHAT_NAME).adapter.rooms.get(room))

      if (io.of(cmn.CHAT_NAME).adapter.rooms.get(room).size === 0) {
        // ルームサーバーにサーバーを削除
        console.log(`Room サーバー削除 ルーム:server:${room} サーバー:${cmn.IP_ADDRESS}`)
        redisClient.srem(`sv:${room}`, cmn.IP_ADDRESS)
      }
    }
  })
}

//#endregion

/*--------------------------------------------------*/

exports.init = init
exports.sendMessageData = sendMessageData
exports.sendCommentData = sendCommentData
exports.inRoom = inRoom
exports.outRoom = outRoom
exports.checkRoomChat = checkRoomChat
