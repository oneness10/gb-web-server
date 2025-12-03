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

const commentsSchema = mongoose.Schema({
  // _id
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // gid
  gid: { 
    type: String,
    //required: true,
    default: '',
  },
  // mid
  mid: { 
    type: String,
    required: true,
  },
  // cid
  cid: { 
    type: String,
    required: true,
    unique: true,
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
  // タイプ
  type: { 
    type: Number,
    required: true,
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

// インデックス作成
commentsSchema.index({ mid:1 })

module.exports = mongoose.model('Comments', commentsSchema)