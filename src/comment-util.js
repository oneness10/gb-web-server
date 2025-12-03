const cmn = require('./common')

// スキーマ
const Groups = require('./schema/groups')
const Objects = require('./schema/objects')

/*--------------------------------------------------*/

// resコメントセット
const setResComment = async (req, comments, sgid) => {
  
  const oidSet = new Set()
  
  for (let comment of comments) {

    let _comment = comment
    if ('_doc' in comment) _comment = comment._doc
      
    // 書き込みメンバー
    if (_comment.wgid !== sgid) {
      oidSet.add(_comment.wmoid)
    }
  }

  const oidArray = Array.from(oidSet) // 一意の配列に変換
  const checkObjects = await Objects.find({ gid:{ $ne:sgid }, oid:{ $in:oidArray } }).select('gid oid status type icon name')

  // グループ
  const gidSet = new Set()
  checkObjects.map(o => {
    if (o.gid !== sgid) gidSet.add(o.gid)
  })
  const gidArray = Array.from(gidSet)
  let checkGroups = []
  if (gidArray.length > 0) {
    checkGroups = await Groups.find({ gid:{ $in:gidArray } }).select('gid mode status pub name')
  }

  // オブジェクトのグループチェック
  for (let checkObject of checkObjects) {
    checkObject._doc.gname = ''
    if (checkObject.gid !== sgid) {
      const group = checkGroups.find(g => g.gid === checkObject.gid)
      if (group) {
        // グループ名セット
        checkObject._doc.gname = group.name
        // グループ停止チェック
        if (group.status === cmn.STOP_GSTATUS) {
          checkObject._doc.status = cmn.STOP_OSTATUS // 停止
        }
        // マイグループならグループ名をセットしない
        if (group.mode === cmn.MYGROUP_GMODE) {
          checkObject._doc.gname = ''
        }
      } else {
        // グループ削除
        checkObject._doc.oid = '' // オブジェクトクリア
      }
    }
  }

  for (let comment of comments) {

    let _comment = comment
    if ('_doc' in comment) _comment = comment._doc
      
    // 書き込みメンバー
    if (_comment.wgid !== sgid) {
      const obj = checkObjects.find(o => o.oid === _comment.wmoid)
      _comment.wmobj = (obj) ? obj._doc : null
      if (obj && obj.status === cmn.DELETE_OSTATUS) { // 状態が削除なら
        const accountGroup = cmn.getAccountGroup(req, obj.gid)
        if (!accountGroup) { // 所属では無いなら
          _comment.wmobj = null
        }
      }
    }
  }
}

/*--------------------------------------------------*/

exports.setResComment = setResComment