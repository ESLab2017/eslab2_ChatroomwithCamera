"use strict";
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var dbClient = require('mongodb').MongoClient;
var assert = require('assert');

var av = require('tessel-av');
var camera = new av.Camera();

app.get('/stream', (request, response) => {
  response.redirect(camera.url);
});

app.use(express.static(__dirname));

var url = 'mongodb://admin:123@ds145289.mlab.com:45289/eslab1db';
//var url = 'mongodb://derek:850211@ds145359.mlab.com:45359/eslab1_db';

var numUsers = 0;
var numGuests = 0;
const clientlist = [];

var db;
dbClient.connect(url, function(err, tempdb) {
    db = tempdb;
});


io.on('connection', function(socket) {

    var profiles = db.collection('userProfile'); //user profiles
    var records = db.collection('talkingRecord'); //talking records
    var userpassword = "";

    socket.on('guest login', function() {
        numGuests += 1;
        if (numGuests == 1) { socket.username = "guest"; } else {
            socket.username = "guest";
            socket.username += numGuests; //guest,guest2,guest3...
        }
        socket.emit('set guestnum', numGuests);
        adduser();
    });

    socket.on('user login', function(profile) {
        checkuser(profile);
        findRecords(db, function(docs) {
            if (docs.length != 0) {
                for (var i in docs) {
                    addrecord(docs[i]);
                }
            }
        }); //end of findRecords
    });

    socket.on('chat message', function(msg) { //receive msg from client
        console.log(socket.username + ":" + msg);
        var mytime = mygetTime();
        io.emit('chat message', {
            u_name: socket.username,
            u_word: msg,
            u_time: mytime
        }); //when 'chat message'
        records.insert({ u_name: socket.username, u_word: msg, u_time: mytime }); //insert talking records to db.
    });

    socket.on('private chat', function(user2) { // user1 chat with user2
        console.log(socket.username + " want to chat with " + user2);
        var target = findsocket(user2);
        if(socket.username==target.username){
           socket.emit('onetoone chat', user2);
        }
        else{
           socket.emit('onetoone chat', user2);
           target.emit('onetoone chat', socket.username); //onetoone chat
        }
    });

    socket.on('private chat message', function(data) {
        var target = findsocket(data.to);
        var mytime = mygetTime();
        if(data.to==socket.username){
          socket.emit('private send', {
            from: socket.username,
            to: socket.username,
            msg: data.msg,
            time: mytime
          });
        }
        else{
          socket.emit('private send', {
            from: socket.username,
            to: target.username,
            msg: data.msg,
            time: mytime
          });
          target.emit('private send', {
            from: socket.username,
            to: target.username,
            msg: data.msg,
            time: mytime
          });
        }
    });

    socket.on('disconnect', function() {
        console.log(socket.username + " left.");
        io.emit('user left', {
            username: socket.username
        });
        removeuserlist(); //update userlist
        io.emit('update userlist', getuserlist());
    });

    //functions
    var checkuser = function(user) { //login
        var userlist = getuserlist();
        for (let i = 0; i < userlist.length; i += 1) {
            if (userlist[i] == user.username) {
                socket.emit('relogin');
            }
        }

        profiles.find({ username: user.username }).toArray(function(err, temp) {
            if (temp.length != 0) {
                userpassword = temp[0].password;
                if (userpassword == user.userpassword) {
                    socket.username = user.username;
                    console.log("user '" + socket.username + "' login sucessful");
                    adduser();
                } else {
                    console.log("wrong password");
                    socket.emit('wrong password');
                }
            } else { //new user, update user profile to the db
                profiles.insert({ username: user.username, password: user.userpassword });
                socket.username = user.username;
                console.log("new user '" + socket.username + "' sign up");
                adduser();
            }
        });
    }; //end of checkuser


    var adduser = function() {
        console.log("new user:" + socket.username + " connected.");
        clientlist.push(socket);
        io.emit('add user', {
            username: socket.username
        });
        io.emit('update userlist', getuserlist());
    };

    var getuserlist = function() {
        const usersList = [];
        for (let i = 0; i < clientlist.length; i += 1) {
            usersList[i] = clientlist[i].username;
            //console.log(usersList[i]);
        }
        return usersList;
    };

    var removeuserlist = function() {
        for (let i = 0; i < clientlist.length; i += 1) {
            if (socket.username == clientlist[i].username) {
                clientlist.splice(i, 1);
            } //remove logout users
        }
    };

    var findRecords = function(db, callback) {
        records.find({}).toArray(function(err, docs) {
            callback(docs);
        });
    }; //get all records

    var addrecord = function(data) {
        socket.emit('add record', {
            u_name: data.u_name,
            u_word: data.u_word,
            u_time: data.u_time
        });
    };

    var findsocket = function(name) {
        for (let i = 0; i < clientlist.length; i += 1) {
            if (name == clientlist[i].username) {
                return clientlist[i];
            }
        }
    };

    function mygetTime() {
        var Today = new Date();
        var str1 = Today.getFullYear() + "/" + (Today.getMonth() + 1) + "/" + Today.getDate();

        var myhour = Today.getHours() + 8; //jet lag +8hr for Taiwan
        var myminute = Today.getMinutes();
        var mysecond = Today.getSeconds();
        if (myhour >= 24) myhour = myhour - 24;

        if (myhour < 10) myhour = "0" + myhour;
        if (myminute < 10) myminute = "0" + myminute;
        if (mysecond < 10) mysecond = "0" + mysecond;

        var str2 = myhour + ":" + myminute + ":" + mysecond;
        return str1 + " " + str2;
    };
}); //end io

http.listen((process.env.PORT || 3000), function() {
    console.log('listening on *:3000');
});
