const mongoose = require('mongoose')

const membersSchema = mongoose.Schema({
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
  // mid
  mid: { 
    type: String,
    required: true,
    unique: true,
  },
  // メンバーoid
  moid: { 
    type: String,
    required: true,
  },
  // 公開ID
  pmid: {
    type: String,
    required: true,
    unique: true,
  },
  // DMモード
  dmmode: {
    type: Number,
    required: true,
  },
  // 設定
  settings: {
    type: Map,
    required: true,
    default: {},
  },
  // お気に入り者数
  scount: {
    type: Number,
    //required: true,
    default: 0,
  },
  // ホームチェック時間
  chtime: {
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
}, {
  versionKey: false,  // __v無し
  //timestamps: true,   // 自動的にcreatedAt、updatedAt作成
})

// インデックス作成
membersSchema.index({ gid:1, mid:1 })
membersSchema.index({ moid:1 })

module.exports = mongoose.model('Members', membersSchema)