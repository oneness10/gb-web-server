const mongoose = require('mongoose')

const groupsSchema = mongoose.Schema({
  // gid
  gid: {
    type: String,
    required: true,
  },
  // グループoid
  goid: {
    type: String,
    required: true,
  },
  // mid
  mid: {
    type: String,
    required: true,
  },
  // メンバーoid
  moid: {
    type: String,
    required: true,
  },
}, {_id: false}) // _id無し

const logsSchema = mongoose.Schema({
  // 登録時間
  ctime: {
    type: Number,
    required: true,
  },
  // IPアドレス
  ip: { 
    type: String,
    required: true,
  },
  // ユーザーエージェント
  ua: { 
    type: String,
    required: true,
  },
  // セッションID
  ssid: { 
    type: String,
    required: true,
  },
}, {_id: false}) // _id無し

const accountsSchema = mongoose.Schema({
  // _id
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // aid
  aid: { 
    type: String,
    required: true,
    unique: true,
  },
  // メールアドレス
  mail: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  // パスワード
  password: {
    type: String,
    required: true,
  },
  // 名前
  name: {
    type: String,
    required: true,
  },
  // 生年月日
  birthday: {
    type: Number,
    required: true,
  },
  // 設定
  settings: {
    type: Map,
    required: true,
    default: {},
  },
  // デフォルトgid
  dgid: {
    type: String,
    required: true,
  },
  // 管理モード
  amode: {
    type: Number,
    required: true,
    default: 0,
  },
  // グループ
  groups: [{
    type: groupsSchema,
    required: true,
    default: [],
  }],
  // 登録時間
  ctime: {
    type: Number,
    required: true,
  },
  // 更新時間
  utime: {
    type: Number,
    required: true,
  },
  // ログ
  logs: [{
    type: logsSchema,
    required: true,
    default: [],
  }],
}, {
  versionKey: false,  // __v無し
  //timestamps: true,   // 自動的にcreatedAt、updatedAt作成
})

module.exports = mongoose.model('Accounts', accountsSchema)