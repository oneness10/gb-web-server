const cmn = require('./common')

// Gmail
const nodemailer = require('nodemailer')
const porter = nodemailer.createTransport({
  service: 'gmail',
  port: 465,
  secure: true,
  auth: {
    user: 'groupby.noreply@gmail.com',
    pass: cmn.GMAIL_APP_PASSWORD
  }
})


/*--------------------------------------------------*/

// メール送信
const sendMail = async (to, subject, text) => {
  try {
    let info = await porter.sendMail({
      from: 'groupby.noreplay@gmail.com',
      to: to,
      subject: subject,
      text: text
    })
    if (info) {
      console.log(`send mail ${to}`)
    }
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
}

/*--------------------------------------------------*/

exports.sendMail = sendMail
