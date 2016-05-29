var knox = require('knox').createClient({
    key: 'xxxxxxxxxxxxxxxxxxxxxxxxx'
  , secret: 'xxxxxxxxxxxxxxxxxxxxx'
  , bucket: 'xxxxxxxxxxxx'
});

var fs = require('fs');

//convert RGB to color name
var namer = require('color-namer');
var names;

//image module for resize image 
var easyimg = require('easyimage');

//module for dominant image color
var ColorThief = require('color-thief');
var colorThief = new ColorThief();

var bs = require('nodestalker'),
    client = bs.Client('172.31.44.195:11300');

//create mongoose connection
var mongoose = require('mongoose');
var User = require('./user');

//this variable store the data of each new image
var newUser1;

mongoose.connect('mongodb://db_usr:db_pass@ds011863.mlab.com:11863/db_cloudcomputing');

//varible for save dominant color
var rgb;

client.watch('default').onSuccess(function(data) {
    function resJob() {
        client.reserve().onSuccess(function(job) {
            console.log('reserved', job);
            //send UUID to resize function
             resizeImage("imageOriginal_"+job.data,job.data);

            client.deleteJob(job.id).onSuccess(function(del_msg) {
                console.log('deleted', job);
                console.log('message', del_msg);
                resJob();
            });
        });
    }

    resJob();
});

//the program will not close instantly for closing the connection to mongoose
process.stdin.resume();

function exitHandler(options, err) {
    if (options.cleanup){
	 mongoose.disconnect();
	 console.log('clean');
    }
    if (err) console.log(err.stack);
    if (options.exit) process.exit();
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));


resizeImage = function(image_uuid,uuid){    
  var imageData ='';
  //get the file from S3
  knox.getFile(image_uuid, function(err, result){
    result.setEncoding('binary')
    if(err) { return next(err); }
    result.on('data',function(chunk){
        imageData +=chunk;
    });
   //save the file locally in tmpImage folder
    result.on('end',function(){
        fs.writeFile('./tmpImage/originalImg.png',imageData,'binary', function(err){
        if(err) throw err
        console.log("file saved");
	//find the dominant color of the image
        dominantColor();
	//save metadata in mlab
	saveQuery(uuid);
	//we send to function the width and string with the size that we wish
         resizeByWidth(75,'Small',uuid);
         resizeByWidth(500,'Medium',uuid);
        });
    });
  });
};

resizeByWidth = function(_width,_size,uuid){
               
 easyimg.resize({ 
 src:'./tmpImage/originalImg.png',
 dst:'./tmpImage/'+_size+'.png',
    width:parseInt(_width)
     }).then(
           function(image){
          console.log("resize success: " + image.width + image.height);
          //upload the resize image to S3. we send the size that we would upload from our locally image folder
	  uploadResizeImg(uuid,_size);
          },
          function(err){
           console.log(err);
          }
     );
};

//upload resize image from locally folder to S3
uploadResizeImg = function(uuid,size){
  knox.putFile('./tmpImage/'+size+'.png', 'image'+size+'_'+uuid, function(err, res){
    if (err) { console.log(err); } 
    res.resume();
  });
};        

dominantColor = function(){
  rgb = colorThief.getColor("./tmpImage/originalImg.png");
  //convert RGB to color name
  names = namer("rgb("+rgb+")");
  console.log("image dominant color: " + names.basic[0].name + "rgb("+rgb+")");
};

//save metadata in mlab
saveQuery = function(uuid){
	
 //define new user for save it in mlab
  newUser1 = new User({
  uuid: uuid,
  dominantColor: names.basic[0].name,
  title: " ",
  creator: " "
   });
	 
   newUser1.save(function(err,doc){
  	 if(err)
  	 console.log(err);
   	else{
   		console.log("\n saved doc: " + doc);
  	 }
   });	
	
};
