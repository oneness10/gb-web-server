const mongoose = require('mongoose')

const starsSchema = mongoose.Schema({
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
  // メンバーoid
  moid: { 
    type: String,
    required: true,
  },
  // 対象gid
  tgid: { 
    type: String,
    required: true,
  },
  // 対象oid
  toid: { 
    type: String,
    required: true,
  },
  // タイプ
  type: { 
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
starsSchema.index({ gid:1, moid:1 })
starsSchema.index({ tgid:1, toid:1 })

module.exports = mongoose.model('Stars', starsSchema)