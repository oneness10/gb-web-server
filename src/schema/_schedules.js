const mongoose = require('mongoose')

const historiesSchema = mongoose.Schema({
  // タイプ
  type: { 
    type: Number,
    required: true,
  },
  // テキスト
  text: { 
    type: String,
    required: true,
  },
  // 登録 時間
  ctime: {
    type: Number,
    required: true,
  },
}, {_id: false}) // _id無し

const _schedulesSchema = mongoose.Schema({
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
  // sid
  sid: {
    type: String,
    required: true,
  },
  // タイプ
  type: { 
    type: Number,
    required: true,
  },
  // 公開
  pub: {
    type: Boolean,
    required: true,
    default: false,
  },
  // oid
  oid: { 
    type: String,
    required: true,
  },
  // 書き込みgid
  wgid: { 
    type: String,
    required: true,
  },
  // 書き込みメンバーoid
  wmoid: { 
    type: String,
    required: true,
  },
  // 参照gid
  rgid: { 
    type: String,
    //required: true,
    default: '',
  },
  // 参照sid
  rsid: { 
    type: String,
    //required: true,
    default: '',
  },
  // 参照oid
  roid: { 
    type: String,
    //required: true,
    default: '',
  },
  // 公開モード
  pmode: {
    type: Number,
    required: true,
  },
  // 関連メンバー
  members: [{
    type: String,
    required: true,
    default: [],
  }],
  // mid
  mid: { 
    type: String,
    //required: true,
    default: '',
  },
  // タイトル
  title: {
    type: String,
    //required: true,
    default: '',
  },
  // 時間フラグ
  tflg: {
    type: Number,
    required: true,
    default: 1,
  },
  // 色
  color: {
    type: Number,
    required: true,
    default: 1,
  },
  // 取り込み数
  incount: {
    type: Number,
    required: true,
    default: 0,
  },
  // 詳細
  details: {
    type: Map,
    required: true,
    default: {},
  },
  // 日付数値
  ymd: {
    type: Number,
    required: true,
  },
  // 開始時間
  stime: {
    type: Number,
    required: true,
  },
  // 終了時間
  etime: {
    type: Number,
    required: true,
  },
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
  // 履歴
  histories: [{
    type: historiesSchema,
    required: true,
    default: [],
  }],
}, {
  versionKey: false,  // __v無し
  //timestamps: true,   // 自動的にcreatedAt、updatedAt作成
})

module.exports = mongoose.model('_Schedules', _schedulesSchema)