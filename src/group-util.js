
// スキーマ
const Groups = require('./schema/groups')
const Members = require('./schema/members')
const Objects = require('./schema/objects')

/*--------------------------------------------------*/

// グループファイルサイズセット
const setGroupFilesize = async (gid, session, deleteSize, addSize, ntime) => {
  
  if (deleteSize > 0 || addSize > 0) {
    // グループ取得
    const setGroup = await Groups.findById(gid).session(session)

    const filesize = (setGroup.settings.get('filesize')) ? setGroup.settings.get('filesize') : 0

    setGroup.settings.set('filesize', filesize - deleteSize + addSize)
    setGroup.utime = ntime

    // グループ更新
    const updateGroup = await setGroup.save({ session:session })
    if (!updateGroup) {
      throw new Error('failed set group file size')
    }
  }
}

// メンバーお気に入り数セット
const setMemberStarCount = async (gid, moid, session, addCount, ntime) => {
  
  // メンバー取得
  const setMember = await Members.findOne({ gid:gid, moid:moid }).session(session)
  if (setMember) {
    setMember.scount = setMember.scount + addCount
    if (setMember.scount < 0) setMember.scount = 0

    setMember.utime = ntime
    
    // メンバー更新
    const updateMemer = await setMember.save({ session:session })
    if (!updateMemer) {
      throw new Error('failed update member star count')
    }
  }
}

// オブジェクトお気に入り数セット
const setObjectStarCount = async (gid, oid, session, addCount, ntime) => {
  
  // オブジェクト取得
  const setObject = await Objects.findOne({ gid:gid, oid:oid }).session(session)
  if (setObject) {
    setObject.scount = setObject.scount + addCount
    if (setObject.scount < 0) setObject.scount = 0
    setObject.utime = ntime
    // オブジェクト更新
    const updateObject = await setObject.save({ session:session })
    if (!updateObject) {
      throw new Error('failed update object star count')
    }
    return updateObject.scount
  }
  return 0
}

//#endregion

/*--------------------------------------------------*/

exports.setGroupFilesize = setGroupFilesize
exports.setMemberStarCount = setMemberStarCount
exports.setObjectStarCount = setObjectStarCount