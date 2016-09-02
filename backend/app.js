// Import main libraries
var express = require('express');
var request = require('request');
var querystring = require('querystring');
var unzip = require('unzip');
var fs = require('fs');
var csvparse = require('csv-parse');
var htmlparser = require('htmlparser2');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var colors = require('colors');
var _ = require('underscore-node');

var gtfs = require('./gtfs/gtfs');
var download = require('./gtfs/download');

var trackerURL = "http://metrarail.com/content/metra/en/home/jcr:content/trainTracker.get_train_data.json?";
var updateGTFSURL = "http://metrarail.com/metra/en/home/about_metra/obtaining_records_from_metra.html";

var rrData;

// Set up the object for our app
app = express();

var logger = function (req,res,next) {
    console.log("   info  (backend) - ".cyan+req.method+" "+req.url);
    next();
}

var error = function (req,res,next) {
    res.send('You requested '+req.url+', which we don\'t have');
    console.log('   error (backend) - '.red+'client tried to '+req.method+' '+req.url+' which is an undefined route :(');
    // No call to next(). Let it die. If you love it, set it free.
}

app.use(cookieParser());
app.use(bodyParser.json());
app.use(logger);
app.use(express.static(__dirname + '/clientside'));

/*if(checkForGTFSURL){
    getGTFSData();
}*/

var gtfsCallback = function(result){
    /*gtfsData = result;
    invalidIds = getInvalidServiceIds();
    gtfsData = removeInvalidServiceIds();*/
    console.log('done');
}
//download(require('./gtfs/config.js'), gtfsCallback);

/*
var rrCallback = function(result){
    rrData = result;
    console.log('done2');
}
parserrData(rrCallback);*/

app.get('/train', function(req, res){
    //res.send(getStopsByRouteId('BNSF'));
    //res.send(getFutureTrainsAtStation('WESTSPRING'));
    //getCurrentTrains('BNSF','CUS','WESTSPRING', callback);
    res.send(rrData);
    //checkForGTFSURL(callback);
    //res.send(gtfsData);
});

app.post('/stations', function (req, res){
    
   var callback = function(result){
       res.send(result);
   }
   getStationsList(req.body.line, callback);
});

app.post('/close_stations', function (req, res){
    var results = findNearStations({lat:req.body.lat, lon:req.body.lon},req.body.radius);
    results = results.splice(0,req.body.max);
    var temp = [];
    for (index in results){
        var distRnd = Math.round(results[index].distance * 100) / 100;
        temp.push({stop_id: results[index].stop.stop_id, stop_name: results[index].stop.stop_name, distance: distRnd});
    }
    res.send(temp);
});
app.post('/close_crossings', function(req, res){
    callback = function(err, results){
        res.send(results);
    }
    gtfs.getStopsByDistance(req.body.lat,req.body.lon,req.body.radius, callback);
});
app.post('/blocked_crossings', function(req, res){
    var callback = function(result){
        res.send(result);
    }
    getBlockedCrossings(req.body.stopId, callback);
});
app.post('/future_trains', function (req, res){
    var callback = function(err,result){
        res.send(result);
    }
    gtfs.getTimesByStop('metra', 'BNSF', 'WESTSPRING', 1, callback)
    //gtfs.getTimesByStop(agency_key, route_id, stop_id, direction_id, cb)
    //getAllFutureTrains(req.body.stopId,req.body.routeId,callback);
});

function parserrData(callback){
        fs.readFile('./rrdata/illinois.txt','utf8', function(err,data){
            csvparse(data,{'columns': true, 'trim': true}, function(err,data){
                callback(data)
            });
        });

}
/*var getNearCrossingsGPS = function(lat,lon,radius,callback){
    var crossings = null;
    geocoder.reverse(lat, lon, function(err, data) {
        for(index in data){
            data[index].city = data[index].city.toUpperCase();
            if(data[index].city == 'WESTERN SPRINGS'){
                data[index].city = "WESTERN SPGS";
            }
        }*
            crossings = _.filter(rrData,function(item){
                for(index in data){
                    if(item.CITYNAM == data[index].city.toUpperCase()){
                        return true;
                    }
                }
            });
            for(crossIndex in crossings){
                crossings[crossIndex] = _.pick(crossings[crossIndex],'STREET','CROSSING')
            }
            callback(crossings);
    });
}*/
var getNearCrossingsGPS = function(lat,lon,radius){
    console.log(lat+" "+lon+" "+radius);
    var crossings = [];
    crossings = _.filter(rrData,function(item){
        if(Math.abs(item.LATITUDE) > 500){
            item.LATITUDE = item.LATITUDE/10000000;
        }
        if(Math.abs(item.LONGITUD) > 500){
            item.LONGITUD = item.LONGITUD/10000000;
        }
        var loc1 = {lat: lat, lon: lon};
        var loc2 = {lat: item.LATITUDE, lon: item.LONGITUD};
        var dist = getDistanceBetweenPoints(loc1,loc2);
        item.DISTANCE = dist;

        return(dist<=radius && item.STREET != "PEDESTRIAN PATHWY" && item.STREET != "TOLLWAY");
    });
    for(crossIndex in crossings){
        crossings[crossIndex] = _.pick(crossings[crossIndex],'STREET','CROSSING','DISTANCE','LATITUDE','LONGITUD');
    }
    return crossings;
}
var getBlockedCrossings = function(stopId, callback){
    var stop;
    var crossings;
    for(index in gtfsData.stops){
        if(gtfsData.stops[index].stop_id == stopId){
            stop = gtfsData.stops[index];
            crossings = _.sortBy(getNearCrossingsGPS(stop.stop_lat,stop.stop_lon,1),'DISTANCE');
            break;
        }
    }
    var futureCallback = function(trains){
        var d = new Date();
        var currentTime = {hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds()};
        for(index in trains.outbound){
            var arrivalTime = parseTime(trains.outbound[index].arrival_time);
            var diff = getTimeDifference(currentTime, arrivalTime);
            console.log(Math.abs(diff));
            if(Math.abs(diff) < 360000){
                console.log(crossings);
                callback(crossings);
                return;
            }
        }
        for(index in trains.inbound){
            var arrivalTime = parseTime(trains.inbound[index].arrival_time);
            var diff = getTimeDifference(currentTime, arrivalTime);
            if(Math.abs(diff) < 36000){
                console.log(Math.abs(diff));
                console.log(crossings)
                callback(crossings);
                return;
            }
        }
        callback([]);
    }
    getAllFutureTrains(stopId,'BNSF',futureCallback);
}

var getAllFutureTrains = function(stopId, routeId, callback){
    var newTrains = {};
    var scheduledTrains = getFutureTrainsAtStation(stopId)
    var liveTrains = {'inbound':[], 'outbound':[]};
    var i = 0;
    var tempCallback = function(data, direction){
        liveTrains[direction] = data;
        i++;
        if(i > 1){
            newTrains.inbound = mergeTrains(scheduledTrains.inbound, liveTrains.inbound);
            newTrains.outbound = mergeTrains(scheduledTrains.outbound, liveTrains.outbound);
            callback(newTrains);
        }
    }
    getLiveTrains(routeId, 'CUS', 'WESTSPRING', 'outbound', tempCallback);
    getLiveTrains(routeId, 'WESTSPRING', 'CUS', 'inbound', tempCallback);
}
var getBearingFromTwoPoints = function(pointA, pointB){
    var lat1 = pointA.lat*(Math.PI/180);
    var lat2 = pointB.lat*(Math.PI/180);
    var latDiff = (pointB.lat-pointA.lat)*(Math.PI/180);
    var longDiff = (pointB.lon-pointA.lon)*(Math.PI/180);

    var y = Math.sin(longDiff) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(longDiff);
    return Math.atan2(y, x)*(Math.PI/180);
}
var mergeTrains = function(scheduledTrains, liveTrains){
    var keys = _.keys(liveTrains);
    for(sch in scheduledTrains){
        keys.forEach(function(key){
            if(scheduledTrains[sch].trip_id == key.trip_id){
                scheduledTrains[sch].arrival_time = key.estimated_arv_time;
                scheduledTrains[sch].departure_time = key.estimated_dpt_time;
                scheduledTrains[sch].live = true;
            }
        });
    }
    return scheduledTrains;
}

var getLiveTrains = function (line, originStopId, destinationStopId, direction, callback){
    var trackerParams = {
        "line": line,
        "origin": originStopId,
        "destination": destinationStopId
    };
     request.get(trackerURL+querystring.stringify(trackerParams), function (e,r,body){
        callback(JSON.parse(body), direction);
    }); 
}

function checkForGTFSURL(callback){
    var isaTag = false;
    var tempAttrib;
    var newURL = '';
    request.get(updateGTFSURL, function(err,res,body){
        var parser = new htmlparser.Parser({
            onopentag: function(name, attribs){
                if(name == "a"){
                    isaTag = true;
                    tempAttrib = attribs;
                }
            },
            ontext: function(text){
                if(isaTag == true && text === "Data"){
                        newURL = res.request.uri.hostname + tempAttrib.href;
                }
            },
            onclosetag: function(tagname){
                bool = false;
            }
        });
        parser.write(body);
        parser.end();
    });
    if(newURL == updateGTFSURL){
        updateGTFSURL = newURL;
        return true;
    }
    return false;
}


var getDirectionFromTripId = function(tripId){
    var trips = gtfsData.trips;
    for(tripIndex in trips){
        if(trips[tripIndex].trip_id == tripId){
            if(trips[tripIndex].direction_id == 0){
                return 'inbound';
            }
            else if(trips[tripIndex].direction_id == 1){
                return 'outbound';
            }
        }
    }
}

var getFutureTrainsAtStation = function (stopId ){
    gtfs.getTimesByStop(agency_key, route_id, stop_id, direction_id, cb)
    var stopTimes = gtfsData.stop_times;
    var trainArray = {inbound: [], outbound:[]};
    var d = new Date();
    var currentTime = {hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds()};
    for(stopIndex in stopTimes){
        if(stopTimes[stopIndex].stop_id == stopId && getTimeDifference(currentTime,parseTime(stopTimes[stopIndex].arrival_time)) < 0){
            var dir = getDirectionFromTripId(stopTimes[stopIndex].trip_id);
            trainArray[dir].push(stopTimes[stopIndex]);
        }
    }
    return trainArray;
}



var getInvalidServiceIds = function(){
    var d = new Date();
    switch(d.getDay()){
        case 0:
            var dayOfWeek = 'sunday';
            break;
        case 1:
            var dayOfWeek = 'monday';
            break;
        case 2:
            var dayOfWeek = 'tuesday';
            break;
        case 3:
            var dayOfWeek = 'wednesday';
            break;
        case 4:
            var dayOfWeek = 'thursday';
            break;
        case 5:
            var dayOfWeek = 'friday';
            break;
        case 6:
            var dayOfWeek = 'saturday';
            break;
    }
    var year = d.getFullYear();
    var month =  d.getMonth()+1;
    var day = d.getDay()+1;
    var currentDate = {year: year, month: month, day: day};
    var tempInvalid = {serviceIds:[], tripIds: []};
    for(index in gtfsData.calendar){
        if(!(gtfsData.calendar[index][dayOfWeek] == 1 && isBetweenDate(currentDate, parseDate(gtfsData.calendar[index].start_date), parseDate(gtfsData.calendar[index].end_date)))){
            tempInvalid.serviceIds.push(gtfsData.calendar[index].service_id);
            for(tripIndex in gtfsData.trips){
                if(gtfsData.trips[tripIndex].service_id == gtfsData.calendar[index].service_id){
                    tempInvalid.tripIds.push(gtfsData.trips[tripIndex].trip_id);
                }
            }
        }
    }
    return tempInvalid;
}

var removeInvalidServiceIds = function(){
    var newData = {};
    var keys = _.keys(gtfsData);
    keys.forEach(function(item){
        if(item != 'calendar'){
            newData[item] = _.reject(gtfsData[item], filterFunc);
        }
    });
    return newData;
}

var filterFunc = function(data){
    var serv = _.find(invalidIds.serviceIds, function(item){
        return(item == data.service_id);
    });
    if(serv !== undefined){
        return true;
    }
    var trip = _.find(invalidIds.tripIds, function(item){
        return(item == data.trip_id);
    });
    if(trip !== undefined){
        return true;
    }
    return false;
}

app.use(error);
app.listen(5000);
