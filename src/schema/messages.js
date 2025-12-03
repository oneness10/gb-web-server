const mongoose = require('mongoose')

const entitiesSchema = mongoose.Schema({
  // タイプ
  type: { 
    type: Number,
    required: true,
  },
  // オフセット
  offset: {
    type: Number,
    required: true,
  },
  // 長さ
  len: {
    type: Number,
    required: true,
  },
  // データ
  data: { 
    type: Map,
    required: true,
    default: {},
  },
}, {_id: false}) // _id無し

const blocksSchema = mongoose.Schema({
  // オフセット
  offset: {
    type: Number,
    required: true,
  },
  // 長さ
  len: {
    type: Number,
    required: true,
  },
  // エンティティ
  entities: [{
    type: entitiesSchema,
    required: true,
    default: [],
  }],
}, {_id: false}) // _id無し

const filesSchema = mongoose.Schema({
  // ファイル名
  fname: { 
    type: String,
    required: true,
  },
  // タイプ
  type: { 
    type: Number,
    required: true,
  },
  // サイズ
  size: {
    type: Number,
    required: true,
    default: 0,
  },
  // データ
  data: { 
    type: Map,
    required: true,
    default: {},
  },
}, {_id: false}) // _id無し

const messagesSchema = mongoose.Schema({
  // _id
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // gid
  gid: { 
    type: String,
    //required: true,
  },
  // mid
  mid: { 
    type: String,
    required: true,
    unique: true,
  },
  // mkey
  mkey: { 
    type: String,
    //required: true,
    default: '',
  },
  // タイプ
  type: { 
    type: Number,
    required: true,
  },
  // 状況
  status: { 
    type: Number,
    required: true,
  },
  // 公開
  pub: {
    type: Boolean,
    required: true,
  },
  // 書き込みgid
  wgid: { 
    type: String,
    //required: true,
  },
  // 書き込みメンバーoid
  wmoid: { 
    type: String,
    //required: true,
  },
  // 参照gid
  rgid: { 
    type: String,
    //required: true,
    default: '',
  },
  // 参照mid
  rmid: { 
    type: String,
    //required: true,
    default: '',
  },
  // 参照wgid
  rwgid: { 
    type: String,
    //required: true,
    default: '',
  },
  // 参照wmoid
  rwmoid: { 
    type: String,
    //required: true,
    default: '',
  },
  // 検索テキスト
  stext: { 
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
  // 関連オブジェクト
  objects: [{
    type: String,
    required: true,
    default: [],
  }],
  // sid
  sid: { 
    type: String,
    //required: true,
    default: '',
  },
  // soid
  soid: { 
    type: String,
    //required: true,
    default: '',
  },
  // スケジュールデータ
  sdata: { 
    type: Map,
    required: true,
    default: {},
  },
  // タイトル
  title: {
    type: String,
    //required: true,
    default: '',
  },
  // テキスト
  text: { 
    type: String,
    //required: true,
    default: '',
  },
  // ブロック
  blocks: [{
    type: blocksSchema,
    required: true,
    default: [],
  }],
  // 画像
  images: [{
    type: filesSchema,
    required: true,
    default: [],
  }],
  // ファイル
  files: [{
    type: filesSchema,
    required: true,
    default: [],
  }],
  // 設定
  settings: {
    type: Map,
    required: true,
    default: {},
  },
  // OK数
  okcount: {
    type: Number,
    required: true,
    default: 0,
  },
  // OKメンバー
  okmembers: [{
    type: String,
    required: true,
    default: [],
  }],
  // コメント数
  ccount: {
    type: Number,
    required: true,
    default: 0,
  },
  // 全てのコメント数
  allccount: {
    type: Number,
    required: true,
    default: 0,
  },
  // 再投稿数
  rpcount: {
    type: Number,
    required: true,
    default: 0,
  },
  // 登録時間
  ctime: {
    type: Number,
    required: true,
  },
  // 編集時間
  etime: {
    type: Number,
    required: true,
  },
  // ホーム時間
  htime: {
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

// インデックス作成
messagesSchema.index({ gid:1 })
messagesSchema.index({ members:1 })
messagesSchema.index({ objects:1 })
messagesSchema.index({ wgid:1, wmoid:1 })

module.exports = mongoose.model('Messages', messagesSchema)