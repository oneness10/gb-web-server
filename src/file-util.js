const cmn = require('./common')

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3')

const s3Client = new S3Client({
  region: cmn.AWS_S3_REGION,
  credentials: {
    accessKeyId: cmn.AWS_ACCESS_KEY,
    secretAccessKey: cmn.AWS_SECRET_ACCESS_KEY,
  },
})

const fs = require('fs')
const path = require('path')

/*--------------------------------------------------*/

// ファイル削除
const deleteFile = (path) => {
  fs.unlink(path, err => {
    if (!err) {
      console.log(`delete file ${path}`) 
    } else {
      // エラーログ書き込み
      cmn.writeErrorlog(null, null, err)
    }
  })
}

// 指定ディレクトリのファイル削除
const deleteDirFile = async (dir) => {
  try {
    if (fs.existsSync(dir)) {
      fs.readdir(dir, function(err, files) {
        if (err) {
          throw new Error(`delete file error:${err.message}`)
        }
        for (let file of files) {
          const filePath = path.join(dir, file)
          fs.unlink(filePath, err => {
            if (err) {
              throw new Error(`delete file error:${err.message}`)
            }
            console.log(`delete file ${filePath}`) 
          })
        }
      })
    } else {
      throw new Error(`delete file not found ${dir}`)
    }
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

// 指定ディレクトリの古いファイル削除(24時間前)
const deleteDirOldFile = (dir) => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dir)) {
      fs.readdir(dir, function(err, files) {
        if (err) {
          console.log(`delete old file error:${err.message}`)
          reject(false)
        }
        const nowDate = new Date()
        for (let file of files) {
          const filePath = path.join(dir, file)
          const info = fs.statSync(filePath)
          if (info.isFile()) {
            const diffMSec = nowDate - info.birthtime
            const diffHour = diffMSec / (60 * 60 * 1000)
            if (diffHour > 24) { // 24時間
              fs.unlink(filePath, err => {
                if (err) {
                  console.log(`delete old file error:${err.message}`)
                }
                console.log(`delete old file ${filePath}`) 
              })
            }
          }
        }
        resolve(true)
      })
    } else {
      console.log(`delete old file not found ${dir}`)
      reject(false)
    }
  })
}

// パス、拡張子取得
const getPathExtend = (fname) => {

  let name = ''
  let extend = ''
  
  if (fname) {
    name = fname
    extend = fname.split('.').pop()

    if (extend !== fname) {
      extend = '.' + extend
      name = fname.substring(0, fname.length - extend.length)
    } else {
      extend = ''
    }
  }

  return { name:name, extend:extend }
}

// パス分割
const splitPath = (path) => {
  const dAry = path.split('/')
  const filename = dAry.pop()
  
  let name = filename
  let extend = filename.split('.').pop()
  
  if (extend !== filename) {
    extend = '.' + extend
    name = filename.substring(0, filename.length - extend.length)
  } else {
    extend = ''
  }

  dAry.push('')
  let dir = dAry.join('/')
  if (dir === '') dir = './'

  return { dir:dir, name:name, extend:extend }
}

// ファイル名チェック('/'が入っていないか)
const checkFilename = (str) => {
  let result = str.indexOf('/')
  if (result === -1)
    return true
  else
    return false
}

// パスチェック('../'が入っていないか)
const checkPath = (str) => {
  let result = str.indexOf('../')
  if (result === -1)
    return true
  else
    return false
}

// 画像チェック
const checkImage = (file) => {
  if (
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/gif' ||
    file.mimetype === 'image/bmp' ||
    file.mimetype === 'image/jpeg'
  ) {
    try {
      const buffer = fs.readFileSync(file.path)
      const arr = new Uint8Array(buffer).subarray(0, 4)
      let header = ''

      for(let i = 0; i < arr.length; i++) {
        header += arr[i].toString(16)
      }

      switch(true) {
        case /^89504e47/.test(header):
          return true // image/png
        case /^47494638/.test(header):
          return true // image/gif
        case /^424d/.test(header):
          return true // image/bmp
        case /^ffd8ff/.test(header):
          return true // image/jpeg
        default:
          return false
      }
    } catch {
      return false
    }
  }
}

// 動画チェック
const checkVideo = (file) => {
  if (
    file.mimetype === 'video/mp4' ||
    file.mimetype === 'video/quicktime'
  ) {
    return true
  } 
  return false
}

/*--------------------------------------------------*/
// S3

// オブジェクト存在チェック
const existsS3Object = async (bucket, key) => {
  try {
    const params = {
      Bucket: bucket,
      Key: key,
    }
    await s3Client.send(new GetObjectCommand(params))
    
    return true
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return false
}

// オブジェクトサイズ取得
const getS3ObjectSize = async (bucket, key) => {
  try {
    const params = {
      Bucket: bucket,
      Key: key,
    }
    const data =  await s3Client.send(new GetObjectCommand(params))
    
    return data.ContentLength
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return 0
}

// S3オブジェクト送信
const putS3Object = async (bucket, key, filePath) => {
  try {
    const params = {
      Bucket: bucket,
      Key: key,
      Body: null,
    }
    const file = fs.readFileSync(filePath)
    params.Body = file
    await s3Client.send(new PutObjectCommand(params))
    console.log(`put s3 object ${bucket}/${key}`)
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

// S3オブジェクトコピー
const copyS3Object = async (bucket, key, copyBucket, copyKey) => {
  try {
    const params = {
      Bucket: bucket,
      Key: key,
      CopySource: `/${copyBucket}/${copyKey}`,
    }
    // 画像をコピー
    await s3Client.send(new CopyObjectCommand(params))
    console.log(`copy S3 object ${copyBucket}/${copyKey} > ${bucket}/${key}`)
    // サイズセット
    const size = await getS3ObjectSize(params.Bucket, params.Key)

    return size
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  return 0
}

// S3オブジェクト削除
const deleteS3Object = async (bucket, key) => {
  try {
    const params = {
      Bucket: bucket,
      Key: key,
    }
    await s3Client.send(new DeleteObjectCommand(params))
    console.log(`delete S3 object ${bucket}/${key}`)
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

/*--------------------------------------------------*/

exports.s3Client = s3Client

exports.deleteFile = deleteFile
exports.deleteDirFile = deleteDirFile
exports.deleteDirOldFile = deleteDirOldFile
exports.checkFilename = checkFilename
exports.checkPath = checkPath
exports.checkImage = checkImage
exports.checkVideo = checkVideo
exports.getPathExtend = getPathExtend
exports.splitPath = splitPath

exports.existsS3Object = existsS3Object
exports.getS3ObjectSize = getS3ObjectSize
exports.putS3Object = putS3Object
exports.copyS3Object = copyS3Object
exports.deleteS3Object = deleteS3Object