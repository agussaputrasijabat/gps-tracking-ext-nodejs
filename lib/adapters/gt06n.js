/* Original code: https://github.com/cnberg/gps-tracking-nodejs/blob/master/lib/adapters/gt06n.js */
f = require('../functions');
var fs = require('fs');

exports.protocol = 'GT06N';
exports.model_name = 'GT06N';
exports.compatible_hardware = ['GT06N/supplier'];

var adapter = function (device) {
  if (!(this instanceof adapter)) {
    return new adapter(device);
  }

  this.format = { 'start': '(', 'end': ')', 'separator': '' };
  this.device = device;
  this.__count = 1;

  /*******************************************
   PARSE THE INCOMING STRING FROM THE DECIVE
   You must return an object with a least: device_id, cmd and type.
   return device_id: The device_id
   return cmd: command from the device.
   return type: login_request, ping, etc.
   *******************************************/
  this.parse_data = function (data) {
    data = f.bufferToHexString(data);
    var parts = {
      'start': data.substr(0, 4)
    };

    if (parts['start'] == '7878') {
      parts['length'] = parseInt(data.substr(4, 2), 16);
      parts['finish'] = data.substr(6 + parts['length'] * 2, 4);

      parts['protocal_id'] = data.substr(6, 2);

      if (parts['finish'] != '0d0a') {
        throw 'finish code incorrect!';
      }

      if (parts['protocal_id'] == '01') {
        parts['device_id'] = data.substr(8, 16);
        parts.cmd = 'login_request';
        parts.action = 'login_request';
      } else if (parts['protocal_id'] == '12') {
        parts['device_id'] = '';
        parts['data'] = data.substr(8, parts['length'] * 2);
        parts.cmd = 'ping';
        parts.action = 'ping';
      } else if (parts['protocal_id'] == '13') {
        parts['device_id'] = '';
        parts.cmd = 'heartbeat';
        parts.action = 'heartbeat';
      } else if (parts['protocal_id'] == '16' || parts['protocal_id'] == '18') {
        parts['device_id'] = '';
        parts['data'] = data.substr(8, parts['length'] * 2);
        parts.cmd = 'alert';
        parts.action = 'alert';
      } else {
        parts['device_id'] = '';
        parts.cmd = 'noop';
        parts.action = 'noop';
      }
    } else {
      parts['device_id'] = '';
      parts.cmd = 'noop';
      parts.action = 'noop';
    }
    return parts;
  };
  this.authorize = function () {
    //this.device.send("\u0078\u0078\u0005\u0001\u0000\u0001\u00d9\u00dc\u000d\u000a");
    //return ;
    var length = '05';
    var protocal_id = '01';
    var serial = f.str_pad(this.__count, 4, 0);

    var str = length + protocal_id + serial;

    this.__count++;

    var crc = require('crc');
    var crcResult = f.str_pad(crc.crc16(str).toString(16), 4, '0');

    var buff = new Buffer('7878' + str + crcResult + '0d0a', 'hex');
    var buff = new Buffer('787805010001d9dc0d0a', 'hex');

    this.device.send(buff);
  };
  this.zeroPad = function (nNum, nPad) {
    return ('' + (Math.pow(10, nPad) + nNum)).slice(1);
  };
  this.synchronous_clock = function (msg_parts) {

  };
  this.receive_heartbeat = function (msg_parts) {
    var buff = new Buffer('787805130001d9dc0d0a', 'hex');
    this.device.send(buff);
  };
  this.run_other = function (cmd, msg_parts) {
  };

  this.request_login_to_device = function () {
    //@TODO: Implement this.
  };

  this.receive_alarm = function (msg_parts) {
    //console.log(msg_parts);
    var str = msg_parts.data;

    var data = {
      'date': str.substr(0, 12),
      'set_count': str.substr(12, 2),
      'latitude_raw': str.substr(14, 8),
      'longitude_raw': str.substr(22, 8),
      'latitude': this.dex_to_degrees(str.substr(14, 8)),
      'longitude': this.dex_to_degrees(str.substr(22, 8)),
      'speed': parseInt(str.substr(30, 2), 16),
      'orientation': str.substr(32, 4),
      'lbs': str.substr(36, 18),
      'device_info': f.str_pad(parseInt(str.substr(54, 2)).toString(2), 8, 0),
      'power': str.substr(56, 2),
      'gsm': str.substr(58, 2),
      'alert': str.substr(60, 4),
    };

    data['power_status'] = data['device_info'][0];
    data['gps_status'] = data['device_info'][1];
    data['charge_status'] = data['device_info'][5];
    data['acc_status'] = data['device_info'][6];
    data['defence_status'] = data['device_info'][7];
    //console.log('alert');
    //console.log(data);
  };

  this.dex_to_degrees = function (dex) {
    return parseInt(dex, 16) / 1800000;
  };

  this.hex_to_dec = function (hex) {
    return parseInt(hex, 16);
  }

  this.get_ping_data = function (msg_parts) {
    var str = msg_parts.data;
    var device_str = f.str_pad(parseInt(str.substr(54, 2)).toString(2), 8, 0);

    var data = {
      gps: {
        date: f.hex_gps_time(str.substr(0, 12)),
        set_count: f.hex_to_int(str.substr(12, 2)),
        latitude: this.dex_to_degrees(str.substr(14, 8)),
        longitude: this.dex_to_degrees(str.substr(22, 8)),
        speed: parseInt(str.substr(30, 2), 16),
        course: f.hex_to_int(str.substr(32, 2)),
        status: f.hex_to_int(str.substr(34, 2))
      },
      lbs: {
        mcc: f.hex_to_int(str.substr(36, 2)) + '' + f.hex_to_int(str.substr(38, 2)),
        mnc: f.hex_to_int(str.substr(40, 2)),
        lac: f.hex_to_int(str.substr(42, 2)),
        cell_id: f.hex_to_int(str.substr(44, 2)) + '' + f.hex_to_int(str.substr(46, 2)) + '' + f.hex_to_int(str.substr(48, 2))
      },
      device_info:
      {
        power_status: f.hex_to_int(device_str[0]),
        gps_status: f.hex_to_int(device_str[1]),
        charge_status: f.hex_to_int(device_str[5]),
        acc_status: f.hex_to_int(device_str[6]),
        defence_status: f.hex_to_int(device_str[7])
      }
    };

    // 'lbs': str.substr(36, 16),

    fs.writeFileSync('ping_data.txt', str);
    fs.writeFileSync('ping_data.json', JSON.stringify(data));

    /*
     "device_info"	: f.str_pad(parseInt(str.substr(54,2)).toString(2), 8, 0),
     "power"	        : str.substr(56,2),
     "gsm"	        : str.substr(58,2),
     "alert"	        : str.substr(60,4),
     data['power_status'] = data['device_info'][0];
     data['gps_status'] = data['device_info'][1];
     data['charge_status'] = data['device_info'][5];
     data['acc_status']= data['device_info'][6];
     data['defence_status'] = data['device_info'][7];
     */

    //console.log(data);

    return data;
  };

  /* SET REFRESH TIME */
  this.set_refresh_time = function (interval, duration) {
  };
};
exports.adapter = adapter;