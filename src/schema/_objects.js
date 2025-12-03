const mongoose = require('mongoose')

const membersSchema = mongoose.Schema({
  // 権限(1:オーナー 2:管理者 3:一般)
  role: { 
    type: Number,
    required: true,
  },
  // oid
  oid: { 
    type: String,
    required: true,
  },
}, {_id: false}) // _id無し

const itemsSchema = mongoose.Schema({
  // oid
  oid: { 
    type: String,
    required: true,
  },
}, {_id: false}) // _id無し

const _objectsSchema = mongoose.Schema({
  // _id
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // gid
  gid: { 
    type: String,
    required: true,
  },
  // oid
  oid: {
    type: String,
    required: true,
  },
  // 状態
  status: { 
    type: Number,
    required: true,
  },
  // 現在の状態
  nstatus: { 
    type: Number,
    required: true,
  },
  // 状態テキスト
  ntext: {
    type: String,
    //required: true,
    default: '',
  },
  // タイプ
  type: { 
    type: Number,
    required: true,
  },
  // 画像
  image: {
    type: String,
    //required: true,
    default: '',
  },
  // アイコン
  icon: {
    type: String,
    //required: true,
    default: '',
  },
  // 名前
  name: {
    type: String,
    required: true,
  },
  // データ
  data: {
    type: Map,
    required: true,
    default: {},
  },
  // お気に入り数
  scount: {
    type: Number,
    required: true,
    default: 0,
  },
  // メンバー
  members: [{
    type: membersSchema,
    required: true,
    default: [],
  }],
  // アイテム
  items: [{
    type: itemsSchema,
    required: true,
    default: [],
  }],
  // 固定メッセージ
  messages: [{
    type: String,
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
}, {
  versionKey: false,  // __v無し
  //timestamps: true,   // 自動的にcreatedAt、updatedAt作成
})

module.exports = mongoose.model('_Objects', _objectsSchema)