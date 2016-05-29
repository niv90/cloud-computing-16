var restify = require('restify');
var uuid = require('node-uuid');
var fs = require('fs');
var redis = require('redis');

var knox = require('knox').createClient({
    key: 'xxxxxxxxxxxxxxx'
  , secret: 'xxxxxxxxxxxx'
  , bucket: 'xxxxxxxxxxxxx'
});

//create beanstalk queue
var bs = require('nodestalker'),
    client = bs.Client('172.31.44.195:11300');
client.use('default');

var redisClient = redis.createClient({
    host:"xxxxxxxxxxxxxxxxxx",
    port:xxxxxxxx
})

redisClient.auth("cloudshenkar16");

//create mongoose connection
var mongoose = require('mongoose');
var User = require('./user');
mongoose.connect('mongodb://db_usr:db_pass@ds011863.mlab.com:11863/db_cloudcomputing');

//the program will not close instantly for closing the connection to mongoose
process.stdin.resume();

function exitHandler(options, err) {
    if (options.cleanup){
	 mongoose.disconnect();
	 console.log('clean system');
    }
    if (err) console.log(err.stack);
    if (options.exit) process.exit();
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));

//create server
var server = restify.createServer();
server.use(restify.queryParser());

//set CROS header for diff domain
server.use(restify.CORS());

//the uuid of image that we want to replace 
var uuidReplaceImg;

//update metadata in mlab
server.put("/files/details/:id/:title/:creator",function (req, res) {
   console.log("inside put method for adding metadata");
   //save in mlab the metadata
   var query = User.findOne().where('uuid',req.params.id);
   query.exec(function(err,doc){
	doc.set('title',"'"+req.params.title+"'");
	doc.set('creator',"'"+req.params.creator+"'");
	
	doc.save(function(err){
	    if(err){
		console.log("mongoos save err: " + err );
		res.send(400, {status:"error: " + err})
	   }
	    else{
		console.log("the modify saved"  );
		res.send(200, {result:"metadata saved"});
	   }
	});
   });
});


//repalce the previous image
server.post("/files/:uuid", function (req, res) {
    console.log("in post post method for replace file");
    //we send the data to S3
    var s3Request = knox.put(req.params.uuid, {'Content-Length': req.contentLength()});
    //we send with pipe the data by chunck and not the full frame
    req.pipe(s3Request);
    s3Request.on("response", function(err, s3res){
    if (err) { console.log(err); }
    //send uuid to client
    res.send(200, {result:"the file replaced"});
    });
});


//ping test
server.get("/", function (req, res) {
	console.log("LB ping testing");
	res.send(200,{status:"ok"});
});


//get image 
server.get("/files/:id", function (req, res) {
  console.log("inside get method got get image");
  knox.getFile(req.params.id, function(err, result){
  if(err) { return next(err); }  
  res.setHeader('Content-Type', 'image/png');
  result.pipe(res);  
  });
});


//get of how much image we have in S3 
server.get("/files/count/images", function (req, res) {
  console.log("inside get method for check the number of the images in S3");
  //we will get the list from redis
  var result = [];
  //get all keys from redis
  redisClient.keys('*', function (err, keys) {
    if (!keys) {
	var query = User.find({}).select('uuid -_id');
  	query.exec(function (err, data) {
        	if (err) return next(err);
		res.send(data);
    	});
    }
    for(var i = 0, len = keys.length; i < len; i++) {
		 result.push({uuid: keys[i]});	
    }
    res.send(result);
    });
});

//get list of image with spcify dominant color
server.get("/files/color/:color", function (req, res) {
  console.log("inside get method for check the list of uuid by dominant color");
 
  var query = User.find({}).where("dominantColor").equals(req.params.color).select('uuid -_id');
  	query.exec(function (err, data) {
        	if (err) return next(err);
		res.send(data);
    	});
});


//delete image by uuid
server.del("/files/:id", function (req, res) {
  console.log("inside del method");
  knox.deleteFile("imageOriginal_"+req.params.id, function(err, result){
  	if(err) { return next(err); }
  });
  knox.deleteFile("imageMedium_"+req.params.id, function(err, result){
  	if(err) { return next(err); }
  });
   knox.deleteFile("imageSmall_"+req.params.id, function(err, result){
  	if(err) { return next(err); }
  });
  //remove uuid from redis
  redisClient.del(req.params.id);
  //remove uuid from mlab
  var query = User.findOne().where('uuid',req.params.id);
  query.exec(function(err,doc){
	var query = doc.remove(function(err,deletedDoc){
	if (err) return next(err);
	res.send(200, {result:"The file with uuid: "+req.params.id +" deleted"});
	});
  });
});

//upload img to s3
server.post("/files", function (req, res) {
  console.log("in post method for upload image to s3")
  //create unique ID for img
  var uuid1 = uuid.v1();

  var s3Request = knox.put("imageOriginal_"+uuid1, {'Content-Length': req.contentLength()});
  //we send with pipe the data by chunck and not the full frame
  req.pipe(s3Request)
  s3Request.on("response", function(err, s3res){ 
  if (err) {  console.log(err); }
  //save the uuid in redis
  redisClient.set(uuid1 , uuid1);
  //send uuid to queue
  console.log("send to queue");
  client.put(uuid1);
  //send uuid to client	
  res.send(200, {result:uuid1});
  })
});


server.use(function slowHandler(req, res, next) {
  setTimeout(function() {
    return next();
  }, 250);
});


server.listen(8080, function() {
	console.log('%s listening at %s', server.name, server.url);
});



