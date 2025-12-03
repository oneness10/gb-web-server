const mongoose = require('mongoose')

const changemailsSchema = mongoose.Schema({
  // id
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // aid
  aid: { 
    type: String,
    required: true,
  },
  // メールアドレス
  mail: {
    type: String,
    required: true,
    lowercase: true,
  },
  // 認証コード
  code: {
    type: String,
    required: true,
  },
  // 登録時間
  ctime: {
    type: Number,
    required: true,
  },
  // 期限時間
  ltime: {
    type: Number,
    required: true,
  },
}, {
  versionKey: false,  // __v無し
  //timestamps: true,   // 自動的にcreatedAt、updatedAt作成
})

module.exports = mongoose.model('Changemails', changemailsSchema)