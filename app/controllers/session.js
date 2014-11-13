
/*!
 * Module dependencies.
 */

var _ = require('lodash');
var multiparty = require('multiparty');
var knox = require('knox');
var randomstring = require('randomstring');
var path = require('path');
var easyimage = require('easyimage');
var async = require('async');
var models = require('../models');
var Q = require('q');
var commandExists = require('command-exists');
var config = require('../../config/config');
var fs = require('fs-extra');


exports.index = function (req, res, next) {

    models.Session.findAll({
        order: '"createdAt" DESC'
    }).then(function(sessions) {
        res.render('session/index', {
            sessions: sessions
        });
    }).error(next);
};


exports.feed = function (req, res, next) {

    var sessionId = req.params.sid;
    var Session = models.Session;
    var VisualizationType = models.VisualizationType;
    var Visualization = models.Visualization;

    Q.all([
        Session
            .find({
                where: {
                    id: sessionId
                }
            }),
        Visualization
            .findAll({
                where: {
                    SessionId: sessionId
                }
            }),
        VisualizationType.findAll({
            order: '"name" ASC'
        })
    ]).spread(function(session, visualizations, vizTypes) {

        if(!session) {
            return res.status(404).send('Session not found');
        }

        _.each(visualizations, function(viz) {
            console.log(viz.images);
        });

        res.render('session/feed', {
            session: session,
            visualizations: visualizations,
            vizTypes: _.object(_.map(vizTypes, function(item) {
                return [item.name, item];
            }))
        });
    }).fail(next);
};

exports.update = function (req, res, next) {

    var sessionId = req.params.sid;
    var Session = models.Session;


    Session
        .update(req.body, {
            id: sessionId
        }).success(function(sessions) {
            return res.json(sessions);
        }).error(next);

};



exports.create = function(req, res, next) {

    models.Session
        .create(_.pick(req.body, 'name'))
        .then(function(session) {
            return res.json(session);
        }).error(next);
};



exports.getCreate = function(req, res, next) {
    models.Session
        .create()
        .then(function(session) {
            return res.redirect('/sessions/' + session.id + '/feed/');    
        }).error(next);
};

exports.delete = function(req, res, next) {
    var sessionId = req.params.sid;

    models.Session
        .find(sessionId)
        .then(function(session) {
            session.destroy().success(function() {
                return res.json(session);                
            }).error(next);
        }).error(next);
};



exports.getDelete = function(req, res, next) {
    
    var sessionId = req.params.sid;

    models.Session
        .find(sessionId)
        .then(function(session) {
            session.destroy().success(function() {
                return res.redirect('/sessions/');
            }).error(next);
        }).error(next);
};



exports.addData = function (req, res, next) {
    var sessionId = req.params.sid;

    var Visualization = models.Visualization;

    if(req.is('json')) {
        Visualization
            .create({
                data: req.body.data,
                type: req.body.type,
                SessionId: sessionId
            }).then(function(viz) {
                req.io.of('/sessions/' + sessionId)
                    .emit('viz', viz);  
                return res.json(viz);
            }).error(next);
    } else {
        var form = new multiparty.Form();

        form.parse(req, function(err, fields, files) {

            _.each(files, function(f) {
                thumbnailAndUpload(f, sessionId, function(err, data) {

                    if(err) {
                        console.log('error in thumbnailAndUpload');
                        return res.status(500).send('error creating image thumbnail');
                    }

                    var imgData = data.imgData;

                    console.log(imgData);

                    var type = 'image';
                    if(fields.type) {
                        if(_.isArray(fields.type) || _.isObject(fields.type)) {
                            type = fields.type[0];    
                        } else {
                            type = fields.type;
                        }                        
                    }

                    Visualization
                        .create({
                            type:  type,
                            images: [imgData],
                            SessionId: sessionId
                        }).then(function(viz) {
                            req.io.of('/sessions/' + sessionId)
                                .emit('viz', viz);

                            return res.json(viz);
                        }).error(next);
                });
            });
        });
    }
};



exports.appendData = function (req, res, next) {

    var sessionId = req.params.sid;
    var vizId = req.params.vid;
    var fieldName = req.params.field;


    models.Visualization
        .find(vizId)
        .then(function(viz) {
            if(req.is('json')) {

                if(fieldName) {

                    if(_.isArray(viz.data[fieldName])) {
                        viz.data[fieldName].push(req.body.data);
                    } else if(_.isUndefined(viz.data[fieldName])) {
                        console.log(fieldName);
                        viz.data[fieldName] = req.body.data;
                    } else {
                        console.log('unknown field');
                    }
                } else {
                    if(_.isArray(viz.data)) {
                        if(_.isArray(req.body.data)) {
                            viz.data = viz.data.concat(req.body.data);
                        } else {
                            viz.data.push(req.body.data);
                        }
                    } else if(_.isUndefined(viz.data)) {
                        viz.data = req.body.data;
                    } else {
                        console.log('unknown field');
                    }
                }

                viz
                    .save()
                    .then(function() {
                        return res.json(viz);
                    }).error(next);

                req.io.of('/sessions/' + sessionId)
                    .emit('append', {
                        vizId: viz.id, 
                        data: req.body.data
                    });
            
            } else if(fieldName === 'images') {

                var form = new multiparty.Form();

                form.parse(req, function(err, fields, files) {
                    _.each(files, function(f) {
                        thumbnailAndUpload(f, sessionId, function(err, data) {

                            if(err) {
                                console.log('error in thumbnailAndUpload');
                                return res.status(500).send('error creating image thumbnail');
                            }
                            var imgData = data.imgData;
                            var s3Response = data.response;

                            if(viz.images) {
                                viz.images.push(imgData);
                            } else {
                                viz.images = [imgData];
                            }
                            viz
                                .save()
                                .then(function() {

                                    if(typeof s3Response === 'object') {
                                        res.statusCode = s3Response.statusCode;
                                        s3Response.pipe(res);
                                    } else {
                                        return res.status(data.response).send('');
                                    }
                                });

                            req.io.of('/sessions/' + sessionId)
                                .emit('append', {
                                    vizId: viz.id, 
                                    data: imgData
                                });

                        });
                    });
                });
            } else {
                return next(500);
            }


        }).error(next);

};



exports.updateData = function (req, res, next) {

    var sessionId = req.params.sid;
    var vizId = req.params.vid;
    var fieldName = req.params.field;


    models.Visualization
        .find(vizId)
        .then(function(viz) {
            if(req.is('json')) {

                if(fieldName) {
                    viz.data[fieldName] = req.body.data;
                } else {
                    viz.data = req.body.data;
                }

                viz
                    .save()
                    .then(function() {
                        return res.json(viz);
                    }).error(next);

                req.io.of('/sessions/' + sessionId)
                    .emit('update', {
                        vizId: viz.id, 
                        data: req.body.data
                    });
            
            } else if(fieldName === 'images') {

                var form = new multiparty.Form();

                form.parse(req, function(err, fields, files) {
                    _.each(files, function(f) {
                        thumbnailAndUpload(f, sessionId, function(err, data) {

                            if(err) {
                                console.log('error in thumbnailAndUpload');
                                return res.status(500).send('error creating image thumbnail');
                            }
                            var imgData = data.imgData;
                            var s3Response = data.response;

                            viz.images = [imgData];
                            
                            viz
                                .save()
                                .then(function() {

                                    if(typeof s3Response === 'object') {
                                        res.statusCode = s3Response.statusCode;
                                        s3Response.pipe(res);
                                    } else {
                                        return res.status(data.response).send('');
                                    }
                                });

                            req.io.of('/sessions/' + sessionId)
                                .emit('update', {
                                    vizId: viz.id, 
                                    data: imgData
                                });

                        });
                    });
                });
            } else {
                return next(500);
            }


        }).error(next);

};



var thumbnailAndUpload = function(f, sessionId, callback) {



    var staticUrl = '/';
    if(config.url) {
        staticUrl = 'http://' + config.url + '/';
    }


    // check if thumbnailing exists,
    // and if s3 creds exist
    var s3Exists = !!config.s3.key;
    var s3Client = null;

    if(s3Exists) {

        s3Client = knox.createClient({
            secure: false,
            key: process.env.S3_KEY,
            secret: process.env.S3_SECRET,
            bucket: process.env.S3_BUCKET,
        });
     }

    var maxWidth = 500;
    var maxHeight = 500;

    // Image file info
    var imgPath = f[0].path;
    var extension = path.extname(imgPath).toLowerCase();
    var filenameWithoutExtension = path.basename(imgPath, extension);


    var thumbnailPath;

    if(process.env.NODE_ENV === 'production') {
        thumbnailPath = path.resolve(__dirname + '/../../' + './tmp/' + filenameWithoutExtension + '_thumbnail' + extension);
    } else {
        thumbnailPath = path.dirname(imgPath) + filenameWithoutExtension + '_thumbnail' + extension;
    }

    // Upload paths for s3
    var uploadName = randomstring.generate();
    var destPath = '/sessions/' + sessionId + '/';
    var originalS3Path = destPath + uploadName;
    var thumbnailS3Path = destPath + uploadName + '_small';


    // s3 headers
    var headers = {
      'x-amz-acl': 'public-read',
    };
    if( extension === '.jpg' || extension === '.jpeg' ) {
        headers['Content-Type'] = 'image/jpeg';
    } else if (extension === '.png') {
        headers['Content-Type'] = 'image/png';
    }

    commandExists('identify', function(err, imageMagickExists) {

        if(imageMagickExists) {

            easyimage
                .info(imgPath)
                .then(function(file) {
                    var thumbWidth;
                    var thumbHeight;

                    console.log('outputing to: ' + thumbnailPath);

                    if(file.width > file.height) {
                        thumbWidth = Math.min(maxWidth, file.width);
                        thumbHeight = file.height * (thumbWidth / file.width);
                    } else {
                        thumbHeight = Math.min(maxHeight, file.height);
                        thumbWidth = file.width * (thumbHeight / file.height);
                    }

                    return easyimage.resize({
                        src: imgPath,
                        dst: thumbnailPath,
                        width: thumbWidth,
                        height: thumbHeight
                    });
                }).then(function() {

                    if(s3Exists) {
                        async.parallel([
                            function(callback) {
                                console.log('s3 exists');
                                console.log('uploading image');
                                console.log(imgPath + ':' + originalS3Path);
                                s3Client.putFile(imgPath, originalS3Path, headers, callback);
                            },
                            function(callback) {
                                console.log('uploading thumbnail');
                                console.log(thumbnailPath + ':' + thumbnailS3Path);
                                s3Client.putFile(thumbnailPath, thumbnailS3Path, headers, callback);
                            }
                        ], function(err, results) {

                            console.log('in herrrr')

                            var s3Response = results[0];

                            var imgURL = 'https://s3.amazonaws.com/' + process.env.S3_BUCKET + originalS3Path;
                            // var thumbURL = 'https://s3.amazonaws.com/' + process.env.S3_BUCKET + thumbnailS3Path;

                            var imgData = imgURL;

                            callback(null, {
                                response: s3Response,
                                imgData: imgData
                            });
                            
                        });
                    } else {

                        console.log('S3 Credentials not found. Using local images');

                        async.parallel([
                            function(callback) {
                                var outpath = path.resolve(__dirname + '../../../public/images/uploads' + originalS3Path);
                                fs.copy(imgPath, outpath, callback);        
                            },
                            function(callback) {
                                var outpath = path.resolve(__dirname + '../../../public/images/uploads' + thumbnailS3Path);
                                fs.copy(thumbnailPath, outpath, callback);
                            }
                        ], function(err) {
                            if(err) {
                                return callback(err);
                            }

                            return callback(null, {
                                response: 200,
                                imgData: staticUrl + 'images/uploads' + originalS3Path
                            });
                        });
                    }

                }, function(err) {
                    console.log(err);
                    callback(err);
                });
        } else {

            if(s3Exists) {
                async.parallel([
                    function(callback) {
                        console.log(imgPath + ':' + originalS3Path);
                        s3Client.putFile(imgPath, originalS3Path, headers, callback);
                    },
                    function(callback) {
                        console.log(thumbnailPath + ':' + thumbnailS3Path);
                        s3Client.putFile(thumbnailPath, thumbnailS3Path, headers, callback);
                    }
                ], function(err, results) {
                    var s3Response = results[0];

                    var imgURL = 'https://s3.amazonaws.com/' + process.env.S3_BUCKET + originalS3Path;
                    // var thumbURL = 'https://s3.amazonaws.com/' + process.env.S3_BUCKET + thumbnailS3Path;

                    var imgData = imgURL;

                    callback(null, {
                        response: s3Response,
                        imgData: imgData
                    });
                    
                });
            } else {

                console.log('S3 Credentials not found. Using local images');

                async.parallel([
                    function(callback) {
                        var outpath = path.resolve(__dirname + '../../../public/images/uploads' + originalS3Path);
                        console.log(outpath);
                        fs.copy(imgPath, outpath, callback);        
                    },
                    function(callback) {
                        var outpath = path.resolve(__dirname + '../../../public/images/uploads' + thumbnailS3Path);
                        console.log(outpath);
                        fs.copy(imgPath, outpath, callback);
                    }
                ], function(err) {
                    if(err) {
                        return callback(err);
                    }

                    return callback(null, {
                        response: 200,
                        imgData: staticUrl + 'images/uploads' + originalS3Path
                    });
                });
            }
        }
    })


};