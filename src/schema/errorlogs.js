const mongoose = require('mongoose')

const errorlogsSchema = mongoose.Schema({
  // id
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
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
  // aid
  aid: {
    type: String,
    required: true,
  },
  // セッションID
  ssid: {
    type: String,
    required: true,
  },
  // コード
  code: {
    type: Number,
    required: true,
  },
  // メソッド
  method: {
    type: String,
    required: true,
  },
  // URL
  url: {
    type: String,
    required: true,
  },
  // ボディ
  body: {
    type: Map,
    required: true,
  },
  // ホスト
  host: {
    type: String,
    required: true,
  },
  // ソース
  src: {
    type: String,
    required: true,
  },
  // メッセージ
  msg: {
    type: String,
    required: true,
  },
  // メモ
  memo: {
    type: String,
    //required: true,
  },
}, {
  versionKey: false,  // __v無し
  //timestamps: true,   // 自動的にcreatedAt、updatedAt作成
})

// インデックス作成
errorlogsSchema.index({ ctime:1 })

module.exports = mongoose.model('Errorlogs', errorlogsSchema)