const cmn = require('./common')
const dtUti = require('./datetime-util')

// スキーマ
const Groups = require('./schema/groups')
const Objects = require('./schema/objects')

/*--------------------------------------------------*/

// スケジュール情報クリア
const clearScheduleInfo = (schedule) => {
  // _id
  // gid
  // sid
  // type
  // status
  schedule.pub = false
  // oid
  // wgid
  // wmoid
  // rgid
  // rsid
  // roid
  // pmode
  schedule.members = []
  schedule.mid = false
  schedule.title = ''
  schedule.tflg = cmn.NONE_TFLG
  schedule.color = cmn.SCH_NONE_COLOR
  schedule.incount = 0
  schedule.details = {}
  schedule.stime = 0
  schedule.etime = 0
  schedule.ctime = 0
  schedule.utime = 0
  schedule.histories = []
}

// resスケジュールセット
const setResSchedule = async (req, schedules, sgid) => {
  
  const gidSet = new Set()
  const oidSet = new Set()
  for (let schedule of schedules) {

    let _schedule = schedule
    if ('_doc' in schedule) _schedule = schedule._doc

    // 参照状態セットされていなかったら状態無しをセット
    if ('rst' in _schedule === false) _schedule.rst = cmn.NONE_RSTATUS

    // グループ
    if (_schedule.rgid !== '' && _schedule.rgid !== sgid) {
      gidSet.add(_schedule.rgid)
    }
    // オブジェクト
    if (_schedule.rgid !== '' && _schedule.rgid !== sgid) {
      oidSet.add(_schedule.roid)
    }
  }
  
  const oidArray = Array.from(oidSet) // 一意の配列に変換
  let checkObjects = []
  if (oidArray.length > 0) {
    checkObjects = await Objects.find({ gid:{ $ne:sgid }, oid:{ $in:oidArray } }).select('gid oid status type icon name')
  }

  // グループ
  checkObjects.map(o => {
    if (o.gid !== sgid) gidSet.add(o.gid)
  })
  const gidArray = Array.from(gidSet)
  let checkGroups = []
  if (gidArray.length > 0) {
    checkGroups = await Groups.find({ gid:{ $ne:sgid }, gid:{ $in:gidArray } }).select('gid mode status pub name')
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

  for (let schedule of schedules) {

    let _schedule = schedule
    if ('_doc' in schedule) _schedule = schedule._doc

    // 取込みスケジュール
    if (_schedule.type === cmn.INSCHEDULE_STYPE) {
      // 参照グループ妥当性チェック
      if (_schedule.rgid !== '' && _schedule.rgid !== sgid) {
        const _group = cmn.getAccountGroup(req, _schedule.rgid)
        if (!_group) {
          const group = checkGroups.find(g => g.gid === _schedule.rgid)
          if (group) {
            if (group.status === cmn.STOP_GSTATUS) {
              _schedule.rst = cmn.GSTOP_RSTATUS // 参照状態グループ停止
              // スケジュール情報クリア
              clearScheduleInfo(_schedule)
            } else {
              if (!group.pub) { // 公開中
                _schedule.rst = cmn.NOTVIEW_RSTATUS // 参照状態非表示
                // スケジュール情報クリア
                clearScheduleInfo(_schedule)
              }
            }
          } else {
            _schedule.rst = cmn.GDELETE_RSTATUS // 参照状態グループ削除
            // スケジュール情報クリア
            clearScheduleInfo(_schedule)
          }
        }
      }
    }
      
    // オブジェクト
    if (_schedule.rgid !== '' && _schedule.rgid !== sgid) {
      const obj = checkObjects.find(o => o.oid === _schedule.roid)
      _schedule.obj = (obj) ? obj._doc : null 
    }

    // 不必要なフィールド削除
    if ('_id' in _schedule) delete _schedule._id
    if ('members' in _schedule) delete _schedule.members
    if ('insch' in _schedule) delete _schedule.insch
  }
}

// スケジュール月日時間文字取得
const getScheuleMonthDateTimeStr = (schedule) => {
  let time_str = ''
  if (schedule) {
    if (schedule.tflg === cmn.SET_TFLG) {
      const sMonthDateStr = dtUti.getUtimeToMonthDateStr(schedule.stime)
      const eMonthDateStr = dtUti.getUtimeToMonthDateStr(schedule.etime)
      if (sMonthDateStr === eMonthDateStr) {
        time_str = `${sMonthDateStr} ${dtUti.getUtimeToTimeStr(schedule.stime)}～${dtUti.getUtimeToTimeStr(schedule.etime)}`
      } else {
        time_str = `${sMonthDateStr} ${dtUti.getUtimeToTimeStr(schedule.stime)}～${eMonthDateStr} ${dtUti.getUtimeToTimeStr(schedule.etime)}`
      }
    } else if (schedule.tflg === cmn.START_TFLG) {
      time_str = `${dtUti.getUtimeToMonthDateStr(schedule.stime)} ${dtUti.getUtimeToTimeStr(schedule.stime)}～`
    } else if (schedule.tflg === cmn.END_TFLG) {
      time_str = `～${dtUti.getUtimeToMonthDateStr(schedule.etime)} ${dtUti.getUtimeToTimeStr(schedule.etime)}`
    } else if (schedule.tflg === cmn.ALL_TFLG) {
      time_str = `${dtUti.getUtimeToMonthDateStr(schedule.stime)} 終日`
    } else if (schedule.tflg === cmn.AM_TFLG) {
      time_str = `${dtUti.getUtimeToMonthDateStr(schedule.stime)} 午前`
    } else if (schedule.tflg === cmn.PM_TFLG) {
      time_str = `${dtUti.getUtimeToMonthDateStr(schedule.stime)} 午後`
    }
  }
  return time_str
}

/*--------------------------------------------------*/

exports.clearScheduleInfo = clearScheduleInfo
exports.setResSchedule = setResSchedule
exports.getScheuleMonthDateTimeStr = getScheuleMonthDateTimeStr