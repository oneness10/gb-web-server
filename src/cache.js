const Redis = require('ioredis')

const cmn = require('./common')

// スキーマ
const Groups = require('./schema/groups')
const Messages = require('./schema/messages')

/*--------------------------------------------------*/
//#region Resisクライント

// Resisクライント
const redisClient = new Redis({
  port: 6379,
  host: process.env.REDIS_SERVER,
})
// Resisクライント接続
redisClient.on('connect', () => {
  console.log('Redis Cache Client connection successful')
})
// Resisクライント切断
redisClient.on('disconnect', () => {
  console.log('Redis Cache Client disconnected')
})
// Resisクライント終了
redisClient.on('end', () => {
  console.log('Redis Cache Client end')
})
// Resisクライントワーニング
redisClient.on("warning", (warning) => {
  console.log(`Redis Cache Client warning:${warning}`)
})
// Resisクライントエラー
redisClient.on('error', (err) => {
  console.log(`Redis Cache Client error:${err}`)
})

/*--------------------------------------------------*/
// ポーリング

// ポーリングデータセット
const setPollingData = (gid, data) => {
  try {
    redisClient.pipeline().sadd(`pdt:${gid}`, JSON.stringify(data)).expire(`pdt:${gid}`, cmn.POLLING_SEC).exec()
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

// オブジェクトポーリングデータセット
const setObjectPollingData = (gid, object, type, poid) => {
  const t = `o${type}`
  const data = { t:t, u:object.utime, i:object.oid }
  if (type === cmn.NEW_PTYPE) data.p = poid
  setPollingData(gid, data)
}

// メッセージポーリングデータセット
const setMessagePollingData = (message, type) => {
  const t = `m${type}`
  setPollingData(message.gid, { t:t, u:message.utime, i:message.mid })
}

// スケジュールポーリングデータセット
const setSchedulePollingData = (schedule, type) => {
  const t = `s${type}`
  setPollingData(schedule.gid, { t:t, u:schedule.utime, i:schedule.sid })
}

// ポーリングデータ取得
const getPollingData = async (gid) => {
  try {
    const list = await redisClient.smembers(`pdt:${gid}`)
    if (list) {
      const data = []
      list.map(d => data.push(JSON.parse(d)))
      return data
    }
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return []
}

/*--------------------------------------------------*/

// データセット
const setData = async (key, data) => {
  try {
    await redisClient.pipeline().set(key, JSON.stringify(data)).expire(key, cmn.CACHE_SEC).exec()
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

// データ取得
const getData = async (key) => {
  try {
    const data = await redisClient.get(key)
    if (data) {
      return JSON.parse(data)
    }
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return null
}

// ロックセット
const setLock = async (key) => {
  try {
    const result = await redisClient.setnx(key, '1')
    if (result) {
      // タイムアウトセット
      await redisClient.expire(key, cmn.CACHE_LOCK_SEC)
    }
    return result
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return false
}

// データ削除
const deleteData = async (key) => {
  try {
    await redisClient.del(key)
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

// メッセージ取得
const getMessage = async (mid) => {
  try {
    let message = null
    for (let i = 0; i <= 5; i++) {
      // キャッシュからデータ取得
      message = await getData(`msg:${mid}`)
      if (message) {
        break
      } else {
        // ロックセット
        const lock = await setLock(`lmsg:${mid}`)
        if (lock) {
          const checkMessage = await Messages.findById(mid).select('gid mid mkey type pub pmode objects')
          if (checkMessage) {
            message = {
              gid:checkMessage.gid,
              mid:checkMessage.mid,
              mkey:checkMessage.mkey,
              type:checkMessage.type,
              pub:checkMessage.pub,
              pmode:checkMessage.pmode,
              objects:(checkMessage.type === cmn.DM_MTYPE) ? checkMessage.objects : []
            }
            // データセット
            await setData(`msg:${mid}`, message)
            //console.log(`cache set msg:${mid}`)
          } else {
            // 空データセット
            await setData(`msg:${mid}`, { mid:'' })
            //console.log(`cache set empty msg:${mid}`)
          }

          // ロック削除
          await deleteData(`lmsg:${mid}`)

          break
        } else {
          //console.log(`sleep(200) ${mid}`)
          await cmn.sleep(200)
        }
      }
    }
    return (message && message.mid) ? message : null
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return null
}

// グループ取得
const getGroup = async (gid) => {
  try {
    let group = null
    for (let i = 0; i <= 5; i++) {
      // キャッシュからデータ取得
      group = await getData(`gp:${gid}`)
      if (group) {
        break
      } else {
        // ロックセット
        const lock = await setLock(`lgp:${gid}`)
        if (lock) {
          const checkGroup = await Groups.findById(gid).select('gid goid ooid pgid mode status pub name')
          if (checkGroup) {
            group = {
              gid: checkGroup.gid,
              goid: checkGroup.goid,
              ooid: checkGroup.ooid,
              pgid: checkGroup.pgid,
              mode: checkGroup.mode,
              status: checkGroup.status,
              pub: checkGroup.pub,
              name: checkGroup.name,
            }
            // データセット
            await setData(`gp:${gid}`, group)
            //console.log(`cache set gp:${gid}`)
          } else {
            // 空データセット
            await setData(`gp:${gid}`, { mid:'' })
            //console.log(`cache set empty gp:${gid}`)
          }

          // ロック削除
          await deleteData(`lgp:${gid}`)

          break
        } else {
          //console.log(`sleep(200) ${gid}`)
          await cmn.sleep(200)
        }
      }
    }
    return (group && group.gid) ? group : null
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return null
}

/*--------------------------------------------------*/

exports.setObjectPollingData = setObjectPollingData
exports.setMessagePollingData = setMessagePollingData
exports.setSchedulePollingData = setSchedulePollingData
exports.getPollingData = getPollingData
exports.deleteData = deleteData
exports.getMessage = getMessage
exports.getGroup = getGroup
