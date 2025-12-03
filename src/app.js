const cmn = require('./common')

const express = require('express')
const session = require('express-session')

const path = require('path')
const cookieParser = require('cookie-parser')
const logger = require('morgan')
// 追加
const bodyParser = require('body-parser')

// Redis(session store用)
const Redis = require('ioredis')
const RedisStore = require("connect-redis").default
const redis = new Redis({
  port: 6379,
  host: process.env.REDIS_SERVER,
})
// 接続
redis.on('connect', () => {
  console.log('Redis Session Store connection successful')
})
// 切断
redis.on('disconnect', () => {
  console.log('Redis Session Store disconnected')
})
// 終了
redis.on('end', () => {
  console.log('Redis Session Store end')
})
// ワーニング
redis.on("warning", (warning) => {
  console.log(`Redis Session Store warning:${warning}`)
})
// エラー
redis.on('error', (err) => {
  console.log(`Redis Session Store error:${err}`)
})


const fileRouter = require('./routes/api-file')
const apiRouter = require('./routes/api')
const apiGroupRouter = require('./routes/api-group')
const apiAccountRouter = require('./routes/api-account')
const apiUploadRouter = require('./routes/api-upload')
const apiMessageRouter = require('./routes/api-message')
const apiCommentRouter = require('./routes/api-comment')
const apiScheduleRouter = require('./routes/api-schedule')

const app = express()

////////////////////////////////////////////
// TODO cross対応 本番では削除
// app.use(function(req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*")
//   res.header("Access-Control-Allow-Headers", "X-Requested-With")
//   next();
// })
////////////////////////////////////////////

app.disable('x-powered-by') // X-Powered-Byを消す

// ログスキップ
const skipLog = (req) => {
  if (req.path) {
    const path = req.path.toLowerCase()
    if (
      path.includes('.css') || 
      path.includes('.js') || 
      path.includes('.svg') || 
      path.includes('.png') || 
      path.includes('.jpeg') || 
      path.includes('.jpg') || 
      path.includes('.ico') || 
      path.includes('.gif') || 
      path.includes('.bmp')
    ) {
      return true
    }
  }
  return false
}
// ログフォーマット
const logFormat = '[:date[iso]] :method :url :status :response-time ms - :res[content-length]'
app.use(logger(logFormat, {
  skip: function (req, res) { return skipLog(req) }
}))
//app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

// 追加
app.use(bodyParser.json())
app.use(session({
  name: 'gb_session_id',
  secret: 'gb_session',
  resave: false,
  saveUninitialized: false,
  store: new RedisStore({ client: redis }),
  cookie: {
    //httpOnly: true, // デフォルトtrue、trueの場合JavaScriptで読めない
    //secure: false,  // HTTPS対応の場合true、デフォルトfalse
    maxAge: 30 * 24 * 60 * 60 * 1000, // 1ヵ月
  },
}))

app.use('/file', fileRouter)
app.use('/api', apiRouter)
app.use('/api/group', apiGroupRouter)
app.use('/api/account', apiAccountRouter)
app.use('/api/upload', apiUploadRouter)
app.use('/api/message', apiMessageRouter)
app.use('/api/comment', apiCommentRouter)
app.use('/api/schedule', apiScheduleRouter)

app.get('/*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public/index.html'), function(err) {
    if (err) {
      res.status(500).send(err)
    }
  })
})

module.exports = app

console.log(`Start Server:${cmn.IP_ADDRESS}:${cmn.PORT}`)
console.log(`ENV=${app.get('env')}`)

/*--------------------------------------------------*/

// MongoDB
const mongoose = require('mongoose')
mongoose.set('strictQuery', false)
mongoose.Promise = global.Promise
// 接続
mongoose.connect(cmn.MONGODB_URI)
const db = mongoose.connection
db.on('error', console.error.bind(console, 'MongoDB connection error:'))
db.once('open', () => console.log('MongoDB connection successful'))

/*--------------------------------------------------*/

const flUti = require('./file-util')
// 一時ディレクトリのファイル削除
flUti.deleteDirFile(cmn.TEMP_DIR)

const Objects = require('./schema/objects')
const Groups = require('./schema/groups')

// システムオブジェクトチェック
Objects.findOne({ gid:cmn.SYSTEM_OID })
.then(object => {
  if (!object) {
    // オブジェクト作成
    Objects.create(
      [{
        _id: new mongoose.Types.ObjectId,
        gid: cmn.SYSTEM_GID,
        oid: cmn.SYSTEM_OID,
        status: cmn.NORMAL_OSTATUS,
        nstatus: cmn.NORMAL_ONSTATUS,
        ntext: '',
        type: cmn.MGROUP_OTYPE,
        image: '',
        icon: '',
        name: cmn.SYSTEM_NAME,
        data: { profile:'' },
        members: [],
        items: [],
        messages: [],
        ctime: 0,
        utime: 0,
      }]
    )
    .then(newObject => {
      if (!newObject) {
        throw new Error('failed create system object')
      }
    })
  }
})
.catch((err) => {
  // エラーログ書き込み
  cmn.writeErrorlog(null, null, err)
})

// システムグループチェック
Groups.findOne({ gid:cmn.SYSTEM_GID })
.then(group => {
  if (!group) {
    // グループ作成
    Groups.create(
      [{
        _id: new mongoose.Types.ObjectId,
        gid: cmn.SYSTEM_GID,
        goid: cmn.SYSTEM_OID,
        ooid: cmn.SYSTEM_OID,
        pgid: cmn.SYSTEM_PGID,
        mode: 0,
        status: 0,
        pub: true,
        name: cmn.SYSTEM_NAME,
        settings: {
          maxmem: 0,
          maxobj: 0,
          maxstar: 0,
          filecapa:0,
          filesize:0
        },
        ctime: 0,
        utime: 0,
      }]
    )
    .then(newGroup => {
      if (!newGroup) {
        throw new Error('failed create system group')
      }
    })
  }
})
.catch((err) => {
  // エラーログ書き込み
  cmn.writeErrorlog(null, null, err)
})