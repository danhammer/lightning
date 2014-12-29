'use strict';

// controllers
var home = require('../app/controllers/home');
var session = require('../app/controllers/session');
var visualizationTypes = require('../app/controllers/visualizationTypes');
var visualization = require('../app/controllers/visualization');
var staticController = require('../app/controllers/static');
var basicAuth = require('basic-auth-connect');
var config = require('./config');


/**
 * Expose
 */

module.exports = function (app) {

    var auth = config.auth || {};

    var authMiddleware = function(req, res, next) {next()};


    if(auth.username && auth.password) {
        authMiddleware = basicAuth(auth.username, auth.password);
    }


    app.get('/playground', home.playground);

    app.get('/js/dynamic/viz', staticController.getDynamicVizBundle);
    app.get('/css/dynamic/viz', staticController.getDynamicVizStyles);
    app.post('/js/dynamic', staticController.bundleJSForExecution);
    app.post('/css/dynamic', staticController.buildSCSS);
    app.get('/visualizations/:vid/public', visualization.publicRead);
    app.get('/sessions/:sid/public', session.publicRead);

    // visualizations
    app.post('/visualizations/types', authMiddleware, visualizationTypes.create);
    app.put('/visualizations/types/:vid', authMiddleware, visualizationTypes.edit);
    app.get('/visualizations/types', authMiddleware, visualizationTypes.index);

    app.get('/visualization-types', authMiddleware, visualizationTypes.show);
    app.get('/visualization-types/fetch-defaults', authMiddleware, visualizationTypes.fetchDefaults);
    app.get('/visualization-types/reset-defaults', authMiddleware, visualizationTypes.resetDefaults);
    app.post('/visualization-types', authMiddleware, visualizationTypes.importViz);
    app.get('/visualization-types/preview', authMiddleware, visualizationTypes.preview);
    app.get('/visualization-types/preview/full', authMiddleware, visualizationTypes.preview);
    app.get('/visualization-types/:vid', authMiddleware, visualizationTypes.editor);
    
    app.get('/', authMiddleware, home.index);
    app.get('/sessions', authMiddleware, session.index);
    app.get('/sessions/create/', authMiddleware, session.getCreate);

    app.get('/sessions/:sid/delete/', authMiddleware, session.getDelete);
    app.delete('/sessions/:sid/', authMiddleware, session.delete);
    app.delete('/visualization-types/:vid/', authMiddleware, visualizationTypes.delete);
    app.get('/visualization-types/:vid/delete', authMiddleware, visualizationTypes.getDelete);

    app.get('/sessions/:sid', authMiddleware, session.feed);
    app.get('/sessions/:sid/feed', authMiddleware, session.feed);
    
    app.put('/sessions/:sid', authMiddleware, session.update);
    app.put('/visualizations/:vid', authMiddleware, visualization.update);
    app.put('/visualizations/:vid/settings', authMiddleware, visualization.updateSettings);
    app.post('/visualizations/:vid/settings', authMiddleware, visualization.updateSettings);

    app.post('/sessions', authMiddleware, session.create);
    app.post('/sessions/:sid/visualizations', authMiddleware, session.addData);
    app.get('/visualizations/:vid', authMiddleware, visualization.read);
    app.get('/visualizations/:vid/embed', authMiddleware, visualization.embed);
    app.get('/visualizations/:vid/iframe', authMiddleware, visualization.iframe);


    app.post('/sessions/:sid/visualizations/:vid/data', authMiddleware, session.appendData);
    app.post('/sessions/:sid/visualizations/:vid/data/:field', authMiddleware, session.appendData);


    app.put('/sessions/:sid/visualizations/:vid/data', authMiddleware, session.updateData);
    app.put('/sessions/:sid/visualizations/:vid/data/:field', authMiddleware, session.updateData);

    
    app.get('/sessions/:sid/visualizations/:vid/data', authMiddleware, visualization.getData);
    app.get('/sessions/:sid/visualizations/:vid/settings', authMiddleware, visualization.getSettings);
    app.get('/visualizations/:vid/settings', authMiddleware, visualization.getSettings);
    app.get('/visualizations/:vid/data', authMiddleware, visualization.getData);
    app.get(/^\/visualizations\/(\d+)\/data\/([^ ]+)/, authMiddleware, visualization.getDataWithKeys);
    app.get(/^\/visualizations\/(\d+)\/settings\/([^ ]+)/, authMiddleware, visualization.getDataWithKeys);
    app.get(/^\/sessions\/\d+\/visualizations\/(\d+)\/data\/([^ ]+)/, authMiddleware, visualization.getDataWithKeys);
    app.get(/^\/sessions\/\d+\/visualizations\/(\d+)\/settings\/([^ ]+)/, authMiddleware, visualization.getSettingsWithKeys);
    // app.post('/sessions/:sid/visualizations/:vid/images', session.addImage);




    app.use(function (err, req, res, next) {
        // treat as 404
        if (err.message
            && (~err.message.indexOf('not found')
            || (~err.message.indexOf('Cast to ObjectId failed')))) {
            return next();
        }
        console.error(err.stack);
        // error page
        res.status(500).render('500', { error: err.stack });
    });

    // assume 404 since no middleware responded
    app.use(function (req, res, next) {
        res.status(404).render('404', {
            url: req.originalUrl,
            error: 'Not found'
        });
    });
};
