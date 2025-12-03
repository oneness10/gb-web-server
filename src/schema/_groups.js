const mongoose = require('mongoose')

const _groupsSchema = mongoose.Schema({
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
  // グループoid
  goid: { 
    type: String,
    required: true,
  },
  // オーナーoid
  ooid: { 
    type: String,
    required: true,
  },
  // 公開ID
  pgid: {
    type: String,
    required: true,
    //unique: true,
  },
  // モード
  mode: {
    type: Number,
    required: true,
  },
  // 状態
  status: { 
    type: Number,
    required: true,
  },
  // 公開
  pub: {
    type: Boolean,
    required: true,
    default: false,
  },
  // 名前
  name: {
    type: String,
    required: true,
  },
  // 設定
  settings: {
    type: Map,
    required: true,
    default: {},
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
}, {
  versionKey: false,  // __v無し
  //timestamps: true,   // 自動的にcreatedAt、updatedAt作成
})

module.exports = mongoose.model('_Groups', _groupsSchema)