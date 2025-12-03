const mongoose = require('mongoose')

const addmembersSchema = mongoose.Schema({
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
  // amid
  amid: { 
    type: String,
    required: true,
    unique: true,
  },
  // 状態
  status: { 
    type: Number,
    required: true,
  },
  // 送信ID
  sendid: { 
    type: String,
    //required: true,
    default: '',
  },
  // メッセージ
  message: {
    type: String,
    //required: true,
    default: '',
  },
  // メンバーoid
  moid: { 
    type: String,
    //required: true,
    default: '',
  },
  // 名前
  name: {
    type: String,
    //required: true,
    default: '',
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
addmembersSchema.index({ gid:1, amid:1 })

module.exports = mongoose.model('Addmembers', addmembersSchema)