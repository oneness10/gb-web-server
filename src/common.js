const ckUti = require('./check-util')
const dtUti = require('./datetime-util')

require('dotenv').config()

const os = require('os')

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI
exports.MONGODB_URI = MONGODB_URI

// S3
const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const AWS_S3_REGION = process.env.AWS_S3_REGION
const AWS_S3_PUBLIC_BUCKET = process.env.AWS_S3_PUBLIC_BUCKET
const AWS_S3_TEMP_BUCKET = process.env.AWS_S3_TEMP_BUCKET
const AWS_S3_IMAGES_BUCKET = process.env.AWS_S3_IMAGES_BUCKET
const AWS_S3_FILES_BUCKET = process.env.AWS_S3_FILES_BUCKET
exports.AWS_ACCESS_KEY = AWS_ACCESS_KEY
exports.AWS_SECRET_ACCESS_KEY = AWS_SECRET_ACCESS_KEY
exports.AWS_S3_REGION = AWS_S3_REGION
exports.AWS_S3_PUBLIC_BUCKET = AWS_S3_PUBLIC_BUCKET
exports.AWS_S3_TEMP_BUCKET = AWS_S3_TEMP_BUCKET
exports.AWS_S3_IMAGES_BUCKET = AWS_S3_IMAGES_BUCKET
exports.AWS_S3_FILES_BUCKET = AWS_S3_FILES_BUCKET

// S3サーバー
const S3_IMAGES_SERVER = 'https://test-gb-images01.s3.ap-northeast-1.amazonaws.com'
exports.S3_IMAGES_SERVER = S3_IMAGES_SERVER

// Gmail
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD
exports.GMAIL_APP_PASSWORD = GMAIL_APP_PASSWORD

// チャット名前空間
const CHAT_NAME = 'gb'
exports.CHAT_NAME = CHAT_NAME

// ルーム維持秒
const ROOMKEEP_SEC = 300
exports.ROOMKEEP_SEC = ROOMKEEP_SEC

// Pub/Sub
const SUB_TIMEOUT_SEC = 300
exports.SUB_TIMEOUT_SEC = SUB_TIMEOUT_SEC

// ポーリング秒
const POLLING_SEC = 60
exports.POLLING_SEC = POLLING_SEC

// ポーリングタイプ
const NEW_PTYPE = 'n'
const UPDATE_PTYPE = 'u'
const DELETE_PTYPE = 'd'
exports.NEW_PTYPE = NEW_PTYPE
exports.UPDATE_PTYPE = UPDATE_PTYPE
exports.DELETE_PTYPE = DELETE_PTYPE

// キャッシュ秒
const CACHE_SEC = 300
exports.CACHE_SEC = CACHE_SEC
// キャッシュロック秒
const CACHE_LOCK_SEC = 1
exports.CACHE_LOCK_SEC = CACHE_LOCK_SEC

// サーバー名
const SERVER_NAME = process.env.SERVER_NAME
exports.SERVER_NAME = SERVER_NAME

// システムgid
const SYSTEM_GID = '1'
exports.SYSTEM_GID = SYSTEM_GID
// システムoid
const SYSTEM_OID = '1'
exports.SYSTEM_OID = SYSTEM_OID
// システムpoid
const SYSTEM_PGID = 'gb'
exports.SYSTEM_PGID = SYSTEM_PGID
// システム名
const SYSTEM_NAME = 'Group By'
exports.SYSTEM_NAME = SYSTEM_NAME

// グループ最大登録数 初期値 10
const MAX_GP = 10
// メンバーの最大数 初期値 100
const MAX_MEM = 100
// オブジェクト最大数 初期値 100
const MAX_OBJ = 200
// お気に入り最大数 初期値 500
const MAX_STAR = 500

exports.MAX_GP = MAX_GP
exports.MAX_MEM = MAX_MEM
exports.MAX_OBJ = MAX_OBJ
exports.MAX_STAR = MAX_STAR

// お気に入り読み込み制限
const STAR_READ_LIMIT = 20
exports.STAR_READ_LIMIT = STAR_READ_LIMIT

// ファイル容量
const FILE_CAPA = 2 * 1024 * 1024 * 1024 // 初期値 2GB
// 画像アップロード最大サイズ
const IMAGE_UPLOAD_MAX_SIZE = 5 * 1024 * 1024 // 5MB
// 動画アップロード最大サイズ
const VIDEO_UPLOAD_MAX_SIZE = 128 * 1024 * 1024 // 128MB
// ファイルアップロード最大サイズ
const FILE_UPLOAD_MAX_SIZE = 50 * 1024 * 1024 // 50MB
// 画像S最大サイズ(幅、高さ)
const IMAGE_S_MAX_SIZE = 200

exports.FILE_CAPA = FILE_CAPA
exports.IMAGE_UPLOAD_MAX_SIZE = IMAGE_UPLOAD_MAX_SIZE
exports.VIDEO_UPLOAD_MAX_SIZE = VIDEO_UPLOAD_MAX_SIZE
exports.FILE_UPLOAD_MAX_SIZE = FILE_UPLOAD_MAX_SIZE
exports.IMAGE_S_MAX_SIZE = IMAGE_S_MAX_SIZE

// OS
const WEB_OS = 'web'
const IOS_OS = 'ios'
const ANDROID_OS = 'android'
exports.WEB_OS = WEB_OS
exports.IOS_OS = IOS_OS
exports.ANDROID_OS = ANDROID_OS

// アイコンS幅
const ICON_S_WIDTH = 32
// アイコンS高さ
const ICON_S_HEIGHT = 32
// メールアドレスチェック制限分
const MAIL_CHECK_LIMIT_MIN = 10
// パスワードチェック制限分
const FORGOT_PASSWORD_CHECK_LIMIT_MIN = 10

exports.ICON_S_WIDTH = ICON_S_WIDTH
exports.ICON_S_HEIGHT = ICON_S_HEIGHT
exports.MAIL_CHECK_LIMIT_MIN = MAIL_CHECK_LIMIT_MIN
exports.FORGOT_PASSWORD_CHECK_LIMIT_MIN = FORGOT_PASSWORD_CHECK_LIMIT_MIN

const path = require('path')
const tempDir = path.join(path.resolve(__dirname, '.'), 'temp')
exports.TEMP_DIR = tempDir

// メッセージ画像最大数
const MESSAGE_IMAGE_MAX_SIZE = 4
exports.MESSAGE_IMAGE_MAX_SIZE = MESSAGE_IMAGE_MAX_SIZE

// グループモード
const MYGROUP_GMODE = 1
const GROUPWARE_GMODE = 2
const HOMEPAGE_GMODE = 3
exports.MYGROUP_GMODE = MYGROUP_GMODE
exports.GROUPWARE_GMODE = GROUPWARE_GMODE
exports.HOMEPAGE_GMODE = HOMEPAGE_GMODE

// グループ状態
const NORMAL_GSTATUS = 1
const STOP_GSTATUS = 2
exports.NORMAL_GSTATUS = NORMAL_GSTATUS
exports.STOP_GSTATUS = STOP_GSTATUS

// メンバー追加状態
const JOIN_AMSTATUS = 1
const INVITATION_AMSTATUS = 2
const HOPEJOIN_AMSTATUS = 3
exports.JOIN_AMSTATUS = JOIN_AMSTATUS
exports.INVITATION_AMSTATUS = INVITATION_AMSTATUS
exports.HOPEJOIN_AMSTATUS = HOPEJOIN_AMSTATUS

// オブジェクト状態
const NORMAL_OSTATUS = 1
const STOP_OSTATUS = 2 // 停止中
const DELETE_OSTATUS = 9 // 削除
exports.NORMAL_OSTATUS = NORMAL_OSTATUS
exports.STOP_OSTATUS = STOP_OSTATUS
exports.DELETE_OSTATUS = DELETE_OSTATUS

// オブジェクト現在の状態
const NORMAL_ONSTATUS = 1
const ENABLE_ONSTATUS = 2
const DISABLE_ONSTATUS = 3
exports.NORMAL_ONSTATUS = NORMAL_ONSTATUS
exports.ENABLE_ONSTATUS = ENABLE_ONSTATUS
exports.DISABLE_ONSTATUS = DISABLE_ONSTATUS

// オブジェクトタイプ
const MGROUP_OTYPE = 1
const GGROUP_OTYPE = 2
const HGROUP_OTYPE = 3
const SUBGROUP_OTYPE = 11
const MEMBER_OTYPE = 12
const TOPIC_OTYPE = 13
const FILE_OTYPE = 14
const LINK_OTYPE = 15
const ALLMEMBER_OTYPE = 102
exports.MGROUP_OTYPE = MGROUP_OTYPE
exports.GGROUP_OTYPE = GGROUP_OTYPE
exports.HGROUP_OTYPE = HGROUP_OTYPE
exports.SUBGROUP_OTYPE = SUBGROUP_OTYPE
exports.MEMBER_OTYPE = MEMBER_OTYPE
exports.TOPIC_OTYPE = TOPIC_OTYPE
exports.FILE_OTYPE = FILE_OTYPE
exports.LINK_OTYPE = LINK_OTYPE
exports.ALLMEMBER_OTYPE = ALLMEMBER_OTYPE

// 権限
const ADMIN_ROLE = 1
const USER_ROLE = 2
exports.ADMIN_ROLE = ADMIN_ROLE
exports.USER_ROLE = USER_ROLE

// DMモード
const ALL_DMMODE = 1 // 全て
const LIMITED_DMMODE = 2 // 限定
const NONE_DMMODE = 3 // しない
exports.ALL_DMMODE = ALL_DMMODE
exports.LIMITED_DMMODE = LIMITED_DMMODE
exports.NONE_DMMODE = NONE_DMMODE

// お気に入りタイプ
const ACTIVE_STYPE = 1  // 登録している
const PASSIVE_STYPE = 2 // 登録されている
exports.ACTIVE_STYPE = ACTIVE_STYPE
exports.PASSIVE_STYPE = PASSIVE_STYPE

// メッセージタイプ
const DM_MTYPE = 1 // ダイレクトメッセージ
const MESSAGE_MTYPE = 2 // メッセージ
const REPOST_MTYPE = 3 // 再投稿
const REF_MTYPE = 4 // 参照
exports.DM_MTYPE = DM_MTYPE
exports.MESSAGE_MTYPE = MESSAGE_MTYPE
exports.REPOST_MTYPE = REPOST_MTYPE
exports.REF_MTYPE = REF_MTYPE
// メッセージ状況
const NOMAL_MSTATSU = 1 // 通常
const PASSIVE_COMMENT_MSTATUS = 11 // コメントパッシブ
const PASSIVE_REPLY_MSTATUS = 12 // 返信アクティビティ
const ACTIVITY_COMMENT_MSTATUS = 21 // コメントしたアクティビティ
const ACTIVITY_OK_MSTATUS = 22 // OKアクティビティ
const ACTIVITY_REPOST_MSTATUS = 23 // 再投稿アクティビティ
const DM_10_MSTATUS = 31 // DM拒否10
const DM_01_MSTATUS = 32 // DM拒否01
const DM_11_MSTATUS = 33 // DM拒否11
exports.NOMAL_MSTATSU = NOMAL_MSTATSU
exports.PASSIVE_COMMENT_MSTATUS = PASSIVE_COMMENT_MSTATUS
exports.PASSIVE_REPLY_MSTATUS = PASSIVE_REPLY_MSTATUS
exports.ACTIVITY_COMMENT_MSTATUS = ACTIVITY_COMMENT_MSTATUS
exports.ACTIVITY_OK_MSTATUS = ACTIVITY_OK_MSTATUS
exports.ACTIVITY_REPOST_MSTATUS = ACTIVITY_REPOST_MSTATUS
exports.DM_10_MSTATUS = DM_10_MSTATUS
exports.DM_01_MSTATUS = DM_01_MSTATUS
exports.DM_11_MSTATUS = DM_11_MSTATUS

// 参照状態
const NONE_RSTATUS = 0 // 無し
const NORMAL_RSTATUS = 1 // 通常
const NOTVIEW_RSTATUS = 2 // 表示できない
const DELETE_RSTATUS = 3 // 削除
const GDELETE_RSTATUS = 4 // グループ削除
const GSTOP_RSTATUS = 5 // グループ停止
exports.NONE_RSTATUS = NONE_RSTATUS
exports.NORMAL_RSTATUS = NORMAL_RSTATUS
exports.NOTVIEW_RSTATUS = NOTVIEW_RSTATUS
exports.DELETE_RSTATUS = DELETE_RSTATUS
exports.GDELETE_RSTATUS = GDELETE_RSTATUS
exports.GSTOP_RSTATUS = GSTOP_RSTATUS

// メッセージ表示タイプ
const MESSAGE_MVTYPE = 'm' // メッセージ
const IMAGE_MVTYPE = 'i'   // 画像
const FILE_MVTYPE = 'f'    // ファイル
exports.MESSAGE_MVTYPE = MESSAGE_MVTYPE
exports.IMAGE_MVTYPE = IMAGE_MVTYPE
exports.FILE_MVTYPE = FILE_MVTYPE

// コメント表示タイプ
const COMMENT_CVTYPE = 1 // コメント
const OK_CVTYPE = 2      // OK
const HISTORY_CVTYPE = 3 // 履歴
exports.COMMENT_CVTYPE = COMMENT_CVTYPE
exports.OK_CVTYPE = OK_CVTYPE
exports.HISTORY_CVTYPE = HISTORY_CVTYPE

// 公開モード
const NONE_PMODE= 0
const ALL_PMODE = 1
const MEMBER_PMODE = 2
const SELF_PMODE = 3
exports.NONE_PMODE = NONE_PMODE
exports.ALL_PMODE = ALL_PMODE
exports.MEMBER_PMODE = MEMBER_PMODE
exports.SELF_PMODE = SELF_PMODE

// コメントタイプ
const COMMENT_CTYPE = 1   // 通常
const OK_CTYPE = 2        // OK
const EDIT_CTYPE = 11     // 変更
const T_EDIT_CTYPE = 12   // タイトル変更
const P_EDIT_CTYPE = 13   // 公開モード変更
const S_ADD_CTYPE = 21    // スケジュール追加
const S_EDIT_CTYPE = 22   // スケジュール変更
const S_DELETE_CTYPE = 23 // スケジュール削除
const I_ADD_CTYPE = 31    // 画像追加
const I_EDIT_CTYPE = 32   // 画像変更(予備)
const I_DELETE_CTYPE = 33 // 画像削除
const F_ADD_CTYPE = 41    // ファイル追加(予備)
const F_EDIT_CTYPE = 42   // ファイル変更
const F_DELETE_CTYPE = 43 // ファイル削除(予備)
exports.COMMENT_CTYPE = COMMENT_CTYPE
exports.OK_CTYPE = OK_CTYPE
exports.EDIT_CTYPE = EDIT_CTYPE
exports.T_EDIT_CTYPE = T_EDIT_CTYPE
exports.P_EDIT_CTYPE = P_EDIT_CTYPE
exports.S_ADD_CTYPE = S_ADD_CTYPE
exports.S_EDIT_CTYPE = S_EDIT_CTYPE
exports.S_DELETE_CTYPE = S_DELETE_CTYPE
exports.I_ADD_CTYPE = I_ADD_CTYPE
exports.I_EDIT_CTYPE = I_EDIT_CTYPE
exports.I_DELETE_CTYPE = I_DELETE_CTYPE
exports.F_ADD_CTYPE = F_ADD_CTYPE
exports.F_EDIT_CTYPE = F_EDIT_CTYPE
exports.F_DELETE_CTYPE = F_DELETE_CTYPE

// ファイルタイプ
const IMAGE_FTYPE = 1 // 画像
const VIDEO_FTYPE = 2 // 動画
const FILE_FTYPE = 11 // ファイル(今後PDF、Excel、Wordなどタイプ追加)
exports.IMAGE_FTYPE = IMAGE_FTYPE
exports.VIDEO_FTYPE = VIDEO_FTYPE
exports.FILE_FTYPE = FILE_FTYPE

// スケジュールタイプ
const SCHEDULE_STYPE = 1 // スケジュール
const INSCHEDULE_STYPE = 2 // 取り込みスケジュール
exports.SCHEDULE_STYPE = SCHEDULE_STYPE
exports.INSCHEDULE_STYPE = INSCHEDULE_STYPE

// 時間フラグ
const NONE_TFLG = 0
const ALL_TFLG = 1
const AM_TFLG = 2
const PM_TFLG = 3
const SET_TFLG = 11
const START_TFLG = 12
const END_TFLG = 13
exports.NONE_TFLG = NONE_TFLG
exports.ALL_TFLG = ALL_TFLG
exports.AM_TFLG = AM_TFLG
exports.PM_TFLG = PM_TFLG
exports.SET_TFLG = SET_TFLG
exports.START_TFLG = START_TFLG
exports.END_TFLG = END_TFLG

// 色
const SCH_NONE_COLOR = 0
const SCH1_COLOR = 1
const SCH2_COLOR = 2
const SCH3_COLOR = 3
const SCH4_COLOR = 4
const SCH5_COLOR = 5
const SCH_IN_COLOR = 99
exports.SCH_NONE_COLOR = SCH_NONE_COLOR
exports.SCH1_COLOR = SCH1_COLOR
exports.SCH2_COLOR = SCH2_COLOR
exports.SCH3_COLOR = SCH3_COLOR
exports.SCH4_COLOR = SCH4_COLOR
exports.SCH5_COLOR = SCH5_COLOR
exports.SCH_IN_COLOR = SCH_IN_COLOR

// メッセージ読み込み制限
const MESSAGE_READ_LIMIT = 20
exports.MESSAGE_READ_LIMIT = MESSAGE_READ_LIMIT
// コメント読み込み制限
const COMMENT_READ_LIMIT = 20
exports.COMMENT_READ_LIMIT = COMMENT_READ_LIMIT
// OK最大表示数
const MAX_OK_VIEW_COUNT = 5
exports.MAX_OK_VIEW_COUNT = MAX_OK_VIEW_COUNT

// エディター文字制限
const EDITOR_STR_LIMIT = 1000
exports.EDITOR_STR_LIMIT = EDITOR_STR_LIMIT

// IPアドレス
const IP_ADDRESS = getIpAddress()
exports.IP_ADDRESS = IP_ADDRESS

// ポート
const PORT = Number(process.env.PORT || 3000)
exports.PORT = PORT

/*--------------------------------------------------*/

// MongoDB
const mongoose = require('mongoose')

/*--------------------------------------------------*/

// OneID8生成
const generateOneId8 = () => {
  let id
  while (true) {
    id = Math.floor((Date.now() * Math.random())).toString(32)
    if (id.length === 8) break
  }

  return id
}

// ObjectID生成
const generateObjectId = () => {
  return new mongoose.Types.ObjectId
}

// 逆ObjectID生成
const generateReverseObjectId = () => {
  let _id = new mongoose.Types.ObjectId
  const idAry = [...String(_id)]
  return idAry.reverse().join('')
}

// スリープ
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// IPアドレス取得
function getIpAddress() {
  const nets = os.networkInterfaces()
  const net = nets["eth0"]?.find(v => v.family == "IPv4")
  return !!net ? net.address : ''
}

// リクエストIPアドレス取得
const getReqIp = (req) => {
  if (req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for']
  }
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress
  }
  if (req.connection.socket && req.connection.socket.remoteAddress) {
    return req.connection.socket.remoteAddress
  }
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress
  }
 
  return req.ip
}

// 管理アカウントチェック
const checkAdminAccount = (req) => {
  if ('amode' in req.session && req.session.amode === 'admin') {
    if (req.method === 'POST') {
      throw new Error('admin post') // 管理アカウントでPOSTはエラー
    }
    return true
  }
  return false
}

// アカウントグループ取得
const getAccountGroup = (req, gid) => {
  return (req.session.account) ? req.session.account.groups.find(g => g.gid === gid) : null
}

// アカウントグループメンバー取得
const getAccountGroupMember = (req, moid) => {
  return (req.session.account) ? req.session.account.groups.find(g => g.moid === moid) : null
}

// ファイルサイズ数字短縮表示
const viewShortFilesize = (filesize) => {
  if (filesize < 1000) {
    return `${filesize}`
  } else if (filesize >= 1000000000) {
    return `${Math.floor(filesize / 100000000) / 10}GB`
  } else if (filesize >= 1000000) {
    return `${Math.floor(filesize / 100000) / 10}MB`
  } else if (filesize >= 1000) {
    return `${Math.floor(filesize / 100) / 10}KB`
  }
}

// 公開モード名取得
const getPmodeName = (pmode) => {
  switch (pmode){
    case ALL_PMODE:
      return '全員'
    case MEMBER_PMODE:
      return '関連メンバーのみ'
    case SELF_PMODE:
      return '自分のみ'
    default:
      return ''
  }
}

const Errorlogs = require('./schema/errorlogs')

// エラーログ書き込み
const writeErrorlog = async (req, json, err) => {
  try {
    // code
    let code = 0
    if (json) {
      code = json.code
      // JSONのエラーチェック
      if (code === 200 && ckUti.checkJsonError(json))
        code = 500
    }
    
    const logs = {
      _id: new mongoose.Types.ObjectId,
      ctime: dtUti.getNowUtime(),
      ip: (req) ? getReqIp(req) : '-',
      ua: (req && req.headers['user-agent']) ? req.headers['user-agent'] : '-',
      aid: (req && req.session.account) ? req.session.account.aid : '-',
      ssid: (req && req.sessionID) ? req.sessionID : '-',
      code: code,
      method: (req && req.method) ? req.method : '-',
      url: (req && req.originalUrl) ? req.originalUrl : '-',
      body: (req && req.method === 'POST' && req.body) ? req.body : {},
      host: `${IP_ADDRESS}:${PORT}`,
      src: err.stack.split('at ')[1].trim(),
      msg: err.message,
      memo: '',
    }

    // エラー
    console.log(`Error: ${logs.code} ${logs.method} ${logs.url} ${logs.src} ${logs.msg}`)

    if (logs.code === 200 || logs.code === 404) {
      // 200、404はエラーログ書き込みしない
      return
    }

    // エラーログ作成
    const newErrorlogs = await Errorlogs.create([logs])
    if (!newErrorlogs) {
       throw new Error('failed create error log')
    }
  } catch(err) {
    // エラー
    console.log(`${req.url} error:${err.message}`)
  }
}

exports.generateOneId8 = generateOneId8
exports.generateObjectId = generateObjectId
exports.generateReverseObjectId = generateReverseObjectId
exports.sleep = sleep
exports.getReqIp = getReqIp
exports.checkAdminAccount = checkAdminAccount
exports.getAccountGroup = getAccountGroup
exports.getAccountGroupMember = getAccountGroupMember
exports.viewShortFilesize = viewShortFilesize
exports.getPmodeName = getPmodeName
exports.writeErrorlog = writeErrorlog