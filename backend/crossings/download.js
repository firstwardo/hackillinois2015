var request = require('request')
  , exec = require('child_process').exec
  , fs = require('fs')
  , path = require('path')
  , csv = require('csv-parse')
  , async = require('async')
  , unzip = require('unzip2')
  , downloadDir = 'downloads'
  , Db = require('mongodb').Db
  , q;

var config = {};

var GTFSFiles = [
  {
      fileNameBase: 'crossingsPublic'
    , collection: 'crossings'
  },
  {
    fileNameBase: 'crossingsPrivate'
    , collection: 'crossings'
  }
];

function main(config, callback){

//open database and create queue for agency list
Db.connect(config.mongo_url, {w: 1}, function(err, db) {
  q = async.queue(downloadGTFS, 1);
  });

  q.drain = function(e) {
    log('All agencies completed (' + config.agencies.length + ' total)');
    callback();
  };


  function downloadGTFS(task, cb) {

    async.series([
      removeDatabase,
      importFiles,
      postProcess,
    ], function(e, results){
      log( e || agency_key + ': Completed');
      cb();
    });


    function removeDatabase(cb) {
      //remove old db records based on agency_key
      async.forEach(GTFSFiles, function(GTFSFile, cb){
        db.collection(GTFSFile.collection, function(e, collection){
          collection.remove({ agency_key: agency_key }, cb);
        });
      }, function(e){
          cb(e, 'remove');
      });
    }


    function importFiles(cb) {
      //Loop through each file and add agency_key
      async.forEachSeries(GTFSFiles, function(GTFSFile, cb){
        if(GTFSFile){
          var filepath = path.join(downloadDir, GTFSFile.fileNameBase + '.txt');
          if (!fs.existsSync(filepath)) return cb();
          log(agency_key + ': ' + GTFSFile.fileNameBase + ' Importing data');
          db.collection(GTFSFile.collection, function(e, collection){
            var input = fs.createReadStream(filepath);
            var parser = csv({columns: true, trim: true});
            parser.on('readable', function(){
              while(line = parser.read()){
                //remove null values
                for(var key in line){
                  if(line[key] === null){
                    delete line[key];
                  }
                }

                //add agency_key
                line.agency_key = agency_key;

                //convert fields that should be int
                if(line.stop_sequence){
                  line.stop_sequence = parseInt(line.stop_sequence, 10);
                }
                if(line.direction_id){
                  line.direction_id = parseInt(line.direction_id, 10);
                }
                if(line.shape_pt_sequence){
                  line.shape_pt_sequence = parseInt(line.shape_pt_sequence, 10);
                }

                //make lat/lon array for stops
                if(GTFSFile.collection == 'stops'){
                   console.log(line);
                console.log(line.stop_lon);
                }
               
                if(line.stop_lat && line.stop_lon){
                  line.loc = [parseFloat(line.stop_lon), parseFloat(line.stop_lat)];
                  //Calulate agency bounds
                  if(agency_bounds.sw[0] > line.loc[0] || !agency_bounds.sw[0]){
                    agency_bounds.sw[0] = line.loc[0];
                  }
                  if(agency_bounds.ne[0] < line.loc[0] || !agency_bounds.ne[0]){
                    agency_bounds.ne[0] = line.loc[0];
                  }
                  if(agency_bounds.sw[1] > line.loc[1] || !agency_bounds.sw[1]){
                    agency_bounds.sw[1] = line.loc[1];
                  }
                  if(agency_bounds.ne[1] < line.loc[1] || !agency_bounds.ne[1]){
                    agency_bounds.ne[1] = line.loc[1];
                  }
                }

                //make lat/long for shapes
                if(line.shape_pt_lat && line.shape_pt_lon){
                  line.shape_pt_lon = parseFloat(line.shape_pt_lon);
                  line.shape_pt_lat = parseFloat(line.shape_pt_lat);
                  line.loc = [line.shape_pt_lon, line.shape_pt_lat];
                }

                //insert into db
                collection.insert(line, function(e, inserted) {
                  if(e) { handleError(e); }
                });
              }
            });
            parser.on('end', function(count){
                cb();
            });
            parser.on('error', handleError);
            input.pipe(parser);
          });
        }
      }, function(e){
        cb(e, 'import');
      });
    }


    function postProcess(cb) {
      log(agency_key + ':  Post Processing data');

      async.series([
          agencyCenter
        , longestTrip
        , updatedDate
      ], function(e, results){
        cb();
      });
    }


    function agencyCenter(cb) {
      var agency_center = [
          (agency_bounds.ne[0] - agency_bounds.sw[0])/2 + agency_bounds.sw[0]
        , (agency_bounds.ne[1] - agency_bounds.sw[1])/2 + agency_bounds.sw[1]
      ];

      db.collection('agencies')
        .update({agency_key: agency_key}, {$set: {agency_bounds: agency_bounds, agency_center: agency_center}}, cb);
    }


    function longestTrip(cb) {
      /*db.trips.find({agency_key: agency_key}).for.toArray(function(e, trips){
          async.forEach(trips, function(trip, cb){
            db.collection('stoptimes', function(e, collection){

            });
            console.log(trip);
            cb();
          }, cb);
        });
      });*/
      cb();
    }

    function updatedDate(cb) {
      db.collection('agencies')
        .update({agency_key: agency_key}, {$set: {date_last_updated: Date.now()}}, cb);
    }
  }
});
}

function handleError(e) {
  console.error(e || 'Unknown Error');
  process.exit(1);
}

// allow script to be called directly from commandline or required (for testable code)
module.exports = main;