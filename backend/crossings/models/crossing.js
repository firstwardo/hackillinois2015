var mongoose = require('mongoose')
  , Agency = mongoose.model('crossing', new mongoose.Schema({
        crossing          :  { type: String, index: true }
      , effdate           :  { type: Number }
      , edate             :  { type: Number }
      , state             :  { type: String }
      , cntycd            :  { type: String }
      , state2            :  { type: String }
      , citycd            :  { type: String }
      , railroad          :  { type: String }
      , rrsubdiv             :  { type: String }
      , street             :  { type: String }
      , typexing             :  { type: Number }
      , latitude             :  { type: Number }
      , logitud             :  { type: Number }
      , ccntynam             :  { type: String }
      , citynam             :  { type: String }
    }));