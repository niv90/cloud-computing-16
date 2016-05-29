var mongoose = require('mongoose');
var schema = mongoose.Schema;
var userSchema = new schema({
    uuid: { type:String, index:1,required:true,unique:true },
    dominantColor : String,
    title : String,
    creator: String
}, {collection:'image_metadata'} );

var User = mongoose.model('User',userSchema);

module.exports = User;