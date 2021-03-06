const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios')
const User = require('./user-db');
const Pritime = require('./pritime-db');
const sendMessage = require('./sendMessage');

const app = express();

app.use(bodyParser.json());

//allow custom header and CORS
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With , yourHeaderFeild');
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');

    if (req.method == 'OPTIONS') {
        res.send(200); /让options请求快速返回/
    }
    else {
        next();
    }
});

app.get('/', (req, res) => {
    res.end('hello world');
})

app.post('/getPritime', (req, res) => {
    let current = req.body.current;
    let todayDate = req.body.todayDate;
    let timeRadio;
    if (current == 0) {
        timeRadio = '第一节';
    } else if (current == 1) {
        timeRadio = '第二节';
    } else if (current == 2) {
        timeRadio = '第三节';
    } else if (current == 3) {
        timeRadio = '第四节';
    } else {
        timeRadio = '晚自习';
    }

    Pritime.find({ partimeDate: todayDate, timeRadio: timeRadio, orderStatus: 0, auditStatus: true }, (err, docs) => {
        if (err) {
            console.log(err);
            res.send(err);
        } else {
            res.json(docs);
        }
    })
})

app.post('/onLogin', (req, res) => {
    let code = req.body.code;
    let userInfo = req.body.userInfo;

    axios({
        url: 'https://api.weixin.qq.com/sns/jscode2session?appid=wx96491a51058b7949&secret=116012e650ea99a8e675f36a98ac3dcf&js_code=' + code + '&grant_type=authorization_code'
    }).then(result => {
        userInfo.openId = result.data.openid;
        User.create(userInfo, (err, docs) => {
            if (err) {
                console.log(err);
                res.send('no')
            }
            res.send(result.data.openid);
        })
    })
})

app.post('/updateUserinfo', (req, res) => {
    let openId = req.body.openid;
    let userInfo = req.body.userInfo;
    User.updateOne({ openId: openId }, userInfo, (err, docs) => {
        if (err) {
            res.end('更新用户信息出错')
        }
        res.end('更新用户信息成功！');
    });
})

app.get('/getUserinfo', async (req, res) => {
    let openId = req.query.openId;
    let userInfo = await User.findOne({ openId: openId })
    res.json(userInfo);
})

app.post('/issuePritime', async (req, res) => {
    let personInfomation = req.body.personInfomation;
    let openId = req.body.openId;
    let formId = req.body.formId;

    for (let item in personInfomation) {
        if (item !== 'note') {
            if (!personInfomation[item]) {
                res.end('no');
                return;
            }
        }
    }

    const userInfo = await User.findOne({ openId: openId })
    personInfomation.avatarUrl = userInfo.avatarUrl;
    personInfomation.nickName = userInfo.nickName;
    personInfomation.auditStatus = userInfo.auditStatus;
    personInfomation.openId = openId;
    personInfomation.formId = formId;
    personInfomation.orderStatus = 0;

    await Pritime.create(personInfomation)

    res.end('ok')
})

app.get('/getUserRecord', async (req, res) => {
    let openId = req.query.openId;

    let userRecord = await Pritime.findOne({ openId: openId })
    if (userRecord) {
        res.json(userRecord);
    } else {
        res.send('无用户记录');
    }
})

app.get('/getOrder', async (req, res) => {
    let openid = req.query.openid;
    let navigatorType = req.query.navigatorType;
    let orderStatus = 0;

    if (navigatorType === 'onGoing') {
        orderStatus = 1;
    } else if (navigatorType === 'onCompleting') {
        orderStatus = 2;
    }

    let order = await Pritime.find({ openId: openid, orderStatus: orderStatus });

    res.json(order);
})

app.get('/getMyOrder', (req, res) => {
    let openId = req.query.openId;

    Pritime.find({ contactOpenId: openId }, (err, doc) => {
        if (err) {
            res.send('err');
            return;
        }
        res.json(doc)
    })
})

app.get('/editOrder', async (req, res) => {
    let _id = req.query._id;
    let editType = req.query.editType;

    if (editType === 'complete') {
        await Pritime.updateOne({ _id: _id }, { orderStatus: 2 })
        let pritimeMes = await Pritime.findOne({ _id: _id })
        let options = {
            "touser": pritimeMes.contactOpenId,
            "template_id": "9BKDqQ6VAnKXGeBQKtzMSC5cEwB9jMt0llrbx9KhiIo",
            "page": "pages/index/index",
            "form_id": pritimeMes.contactFormId,
            "data": {
                "keyword1": {
                    "value": pritimeMes.partimeDate + '&' + pritimeMes.timeRadio
                },
                "keyword2": {
                    "value": pritimeMes.name
                },
                "keyword3": {
                    "value": '该订单已经被发单人视为已完成，如有问题请拨打下方投诉电话！'
                },
                "keyword4": {
                    "value": '18845573607'
                }
            }
        }

        sendMessage(options);

    } else if (editType === 'del') {
        await Pritime.deleteOne({ _id: _id })
    } else if (editType === 'return') {
        let formId = req.query.formId;

        let pritimeMes = await Pritime.findOne({ _id: _id })

        let options = {
            "touser": pritimeMes.contactOpenId,
            "template_id": "d0GKD7mHeiLCLi4jxQRgrCI8G7uqUxo8rEezc3vcMGk",
            "page": "pages/index/index",
            "form_id": pritimeMes.contactFormId,
            "data": {
                "keyword1": {
                    "value": pritimeMes.partimeDate + '&' + pritimeMes.timeRadio
                },
                "keyword2": {
                    "value": pritimeMes.wechatNum
                },
                "keyword3": {
                    "value": '该订单已经被发单人取消，即不再为您服务，如果是发单人擅自取消，请拨打下方的投诉电话！'
                },
                "keyword4": {
                    "value": '18845573607'
                }
            }
        }

        sendMessage(options);

        await Pritime.updateOne({ _id: _id }, { orderStatus: 0, formId: formId, $unset: { contactName: '', contactSex: '', contactTelNum: '', contactWechatNum: '', contactOpenId: '' } })

    }
    res.end('ok')
})

app.post('/addUserInfo', (req, res) => {

    let personInfomation = req.body.personInfomation;
    let openId = req.body.openId;

    for (let item in personInfomation) {
        if (!personInfomation[item]) {
            res.end('no');
            return;
        }
    }

    let name = personInfomation.name;
    let sex = personInfomation.sex;
    let telNum = personInfomation.telNum;
    let wechatNum = personInfomation.wechatNum;
    let student_id = personInfomation.student_id;
    let auditStatus = true

    User.updateOne({ openId: openId }, { name: name, sex: sex, telNum: telNum, wechatNum: wechatNum, student_id: student_id, auditStatus: auditStatus }, (err, doc) => {
        if (err) {
            res.end('no');
            return;
        }
        res.end('ok');
    });
})

app.post('/orderContact', async (req, res) => {
    let _id = req.body._id;
    let openId = req.body.openId;
    let contactFormId = req.body.formId

    const userInfo = await User.findOne({ openId: openId })

    let name = userInfo.name;
    let telNum = userInfo.telNum;
    let wechatNum = userInfo.wechatNum;
    let sex = userInfo.sex;

    let pritimeMes = await Pritime.findOne({ _id: _id });

    if (pritimeMes.openId === openId) {
        res.send('same')
        return;
    }

    if (pritimeMes.orderStatus !== 0) {
        res.send('already')
        return;
    }

    let options = {
        "touser": pritimeMes.openId,
        "template_id": "yAo8fZ9yoGDYNiLbtF-tTooeGBsT3dbIDvF7j5KyV0M",
        "page": "pages/order/order?type=onGoing",
        "form_id": pritimeMes.formId,
        "data": {
            "keyword1": {
                "value": name
            },
            "keyword2": {
                "value": wechatNum
            },
            "keyword3": {
                "value": telNum
            },
            "keyword4": {
                "value": pritimeMes.partimeDate
            },
            "keyword5": {
                "value": pritimeMes.timeRadio
            },
            "keyword6": {
                "value": "消息已经下发，请尽快取得联系!"
            }
        }
    }

    sendMessage(options);

    Pritime.updateOne({ _id: _id }, { orderStatus: 1, contactName: name, contactSex: sex, contactTelNum: telNum, contactWechatNum: wechatNum, contactOpenId: openId, contactFormId: contactFormId }, (err, doc) => {
        if (err) {
            console.log(err);
            res.send('no');
            return;
        }
        res.send('ok');
    })
})

app.get('/getData', (req, res) => {
    User.find((err, doc) => {
        if (err) {
            res.send('no');
            return;
        }
        res.json(doc)
    })
})

app.post('/changeAuditStatus', (req, res) => {
    let _id = req.body._id;
    let auditStatus = req.body.auditStatus;
    User.updateOne({ _id: _id }, { auditStatus: auditStatus }, (err, doc) => {
        if (err) {
            console.log(err);
            res.send('no');
            return;
        }
        res.send('ok');
    })
})

app.listen(3001, () => {
    console.log('Server listenning part 3001');
})