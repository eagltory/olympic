///////////////////////////////////////////////////////////////////////////////////////////////////
'use strict';
var MongoClient = require('mongodb').MongoClient;
var async = new require('async');
var log4js = require('log4js');
var logger = log4js.getLogger();
var AsyncLock = require('async-lock');
var lock = new AsyncLock({timeout: 5000});
var restClientBase = require('node-rest-client').Client;
var restClient = new restClientBase();
const NodeCache = require('node-cache');
const myCache = new NodeCache();
const cassandra = require('cassandra-driver');
const mariadbClient = require('mysql');
const aws = require('aws-sdk');
var kafka = require('kafka-node');
var elasticsearchBase = require('elasticsearch');

///////////////////////////////////////////////////////////////////////////////////////////////////
// Global Variables
///////////////////////////////////////////////////////////////////////////////////////////////////
var CIRCUIT_BREAKER_START_TIME = null;
var IS_CIRCUIT_BREAK = false;
var IS_CIRCUIT_BREAK_CHECK = false;

///////////////////////////////////////////////////////////////////////////////////////////////////
// Application setting value
///////////////////////////////////////////////////////////////////////////////////////////////////
var _options = {
    CALL_TIMEOUT: 500, // Function timeout(in milliseconds) for Circuit Breaking Test
    CIRCUIT_BREAKER_DURATION: 10, // Frequency to test if Circuit Breaker recover (in seconds)
    CACHE_TTL: 30, // Data cache Time To Live (in seconds)
    MONGODB_POOL_SIZE: 1,
    MONGODB_URL: 'mongodb://localhost:27017/vod',
    CASSANDRA_URL: ['localhost'],
    CASSANDRA_KEYSPACE: 'vod',
    KAFKA_URL: 'broker:9092',
    MARIADB_HOST: 'localhost',
    MARIADB_DATABASE: 'pooq',
    MARIADB_USER: 'root',
    MARIADB_PASSWORD: 'babo',
    MARIADB_CONNECTION_LIMIT: 1,
    REST_CHECK_URL: 'http://localhost:8090/echo?request=HelloWorld',
    S3_ACCESS_KEY: 'AKIAJXJLFO3YXYHXX6RA',
    S3_SECRET_KEY: 'UBS5u4JCbhpP0GlJRDbWJDvMgcMfgWdxFHjUDbzf',
    S3_PARAMS: {Bucket: 'felix-test-1', Key: 'sample.json'},
    ELASTICSEARCH_URL: 'localhost:9200',
    ELASTICSEARCH_AUTH: 'elastic:changeme',
    CIRCUIT_BREAKER_TARGET: ['mongodb', 'cassandradb', 'mariadb', 'rest', 's3', 'elasticsearch']
};

var mongodb = null;
var isMongoDbOpen = false;

var cassandradb = null;
var isCassandraOpen = false;

var mariadb = null;
var isMariaDbOpen = false;

var kafkaproducer = null;
var isKafkaOpen = false;

var isRestOpen = false;

var s3 = null;
var s3Params = null;
var isS3Open = false;

var elasticsearchClient = null;
var isElasticsearchOpen = false;


exports.kafka_msg = function (key, value) {
    this.key = key;
    this.value = value;
};

//region ====Setter/Getter====
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.set_options = function (set_data) {
    _options = set_data;
    aws.config.credentials = new aws.Credentials(_options.S3_ACCESS_KEY, _options.S3_SECRET_KEY, null);
    s3 = new aws.S3();
    elasticsearchClient = new elasticsearchBase.Client({
        host: _options.ELASTICSEARCH_URL, httpAuth: _options.ELASTICSEARCH_AUTH, log: 'error'
    });
};
exports.get_option = function () {
    return _options;
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_mongodb = function () {
    return mongodb;
};
exports.set_mongodb = function (db) {
    mongodb = db;
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_cassandradb = function () {
    return cassandradb;
};
exports.set_cassandradb = function (db) {
    cassandradb = db;
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_mariadb = function () {
    return mariadb;
};
exports.set_mariadb = function (db) {
    mariadb = db;
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_kafka_producer = function () {
    return kafkaproducer;
};
exports.set_kafka_producer = function (producer) {
    kafkaproducer = producer;
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_rest = function () {
    return restClient;
};
exports.set_rest = function (db) {
    restClient = db;
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_s3 = function () {
    return s3;
};
exports.set_s3 = function (db) {
    s3 = db;
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_elasticsearch = function () {
    return elasticsearchClient;
};
exports.set_elasticsearch = function (db) {
    elasticsearchClient = db;
};///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_s3Params = function () {
    return _options.S3_PARAMS;
};
exports.set_s3Params = function (db) {
    _options.S3_PARAMS = db;
};
//endregion

///////////////////////////////////////////////////////////////////////////////////////////////////
exports.state_checkCircuit = function (callback) {
    if (IS_CIRCUIT_BREAK) {
        // logger.info('state_checkCircuit, IS_CIRCUIT_BREAK=', IS_CIRCUIT_BREAK);
        var timeDiff = (Date.now() - CIRCUIT_BREAKER_START_TIME) / 1000;
        if (timeDiff >= _options.CIRCUIT_BREAKER_DURATION) {
            if (!IS_CIRCUIT_BREAK_CHECK) {
                // logger.info('state_checkCircuit START');
                IS_CIRCUIT_BREAK_CHECK = true;
                var tally = 0;
                async.waterfall([function (callback) {
                    if (_options.CIRCUIT_BREAKER_TARGET.indexOf('mongodb') > -1) {
                        logger.info('state_checkCircuit:circuit breaking, mongodb');
                        checkMongoDBConnection(function (err) {
                            if (err === null) {
                                logger.info('checkCircuit, mongodb +1');
                                tally++;
                                callback(null);
                            } else {
                                circuitReset();
                                callback('error');
                            }
                        });
                    } else {
                        logger.info('PASS: mongodb');
                        callback(null);
                    }
                }, function (callback) {
                    if (_options.CIRCUIT_BREAKER_TARGET.indexOf('cassandradb') > -1) {
                        logger.info('state_checkCircuit:circuit breaking, cassandradb');
                        checkCassandraDBConnection(function (err) {
                            if (err === null) {
                                logger.info('checkCircuit, cassandradb +1');
                                tally++;
                                callback(null);
                            } else {
                                circuitReset();
                                callback('error');
                            }
                        });
                    } else {
                        logger.info('PASS: cassandradb');
                        callback(null);
                    }
                }, function (callback) {
                    if (_options.CIRCUIT_BREAKER_TARGET.indexOf('mariadb') > -1) {
                        logger.info('state_checkCircuit:circuit breaking, mariadb');
                        checkMariaDBConnection(function (err) {
                            if (err === null) {
                                logger.info('checkCircuit, mariadb +1');
                                tally++;
                                callback(null);
                            } else {
                                circuitReset();
                                callback('error');
                            }
                        });
                    } else {
                        logger.info('PASS: mariadb');
                        callback(null);
                    }
                }, function (callback) {
                    if (_options.CIRCUIT_BREAKER_TARGET.indexOf('rest') > -1) {
                        logger.info('state_checkCircuit:circuit breaking, rest');
                        checkRestConnection(function (err) {
                            if (err === null) {
                                logger.info('checkCircuit, rest +1');
                                tally++;
                                callback(null);
                            } else {
                                circuitReset();
                                callback('error');
                            }
                        });
                    } else {
                        logger.info('PASS: rest');
                        callback(null);
                    }
                }, function (callback) {
                    if (_options.CIRCUIT_BREAKER_TARGET.indexOf('s3') > -1) {
                        logger.info('state_checkCircuit:circuit breaking, s3');
                        checkS3Connection(function (err) {
                            if (err === null) {
                                logger.info('checkCircuit, s3 +1');
                                tally++;
                                callback(null);
                            } else {
                                circuitReset();
                                callback('error');
                            }
                        });
                    } else {
                        logger.info('PASS: s3');
                        callback(null);
                    }
                }, function (callback) {
                    if (_options.CIRCUIT_BREAKER_TARGET.indexOf('elasticsearch') > -1) {
                        logger.info('state_checkCircuit:circuit breaking, elasticsearch');
                        checkElasticsearchConnection(function (err) {
                            if (err === null) {
                                logger.info('checkCircuit, elasticsearch +1');
                                tally++;
                                callback(null);
                            } else {
                                circuitReset();
                                callback('error');
                            }
                        });
                    } else {
                        logger.info('PASS: elasticsearch');
                        callback(null);
                    }
                }, function (callback) {
                    logger.info('tally=', tally);
                    if (tally >= _options.CIRCUIT_BREAKER_TARGET.length) {
                        IS_CIRCUIT_BREAK = false; // Circuit breaker release
                        logger.info('CB released');
                    } else {
                        CIRCUIT_BREAKER_START_TIME = Date.now();  // Still on circuit breaker
                        circuitReset();
                        logger.info('Still CB');
                    }
                    IS_CIRCUIT_BREAK_CHECK = false;
                    callback(null);
                }], function (err) {
                    logger.info('state_checkCircuit:ERROR ', err);
                    IS_CIRCUIT_BREAK_CHECK = false;
                    if (IS_CIRCUIT_BREAK) {
                        circuitReset();
                    }
                    callback(null);
                });
            }
        } else {
            callback(null);
        }
    } else {
        // logger.info('state_checkCircuit, No CB status, returning');
        callback(null);
    }
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.ProcessWrapper = function (Params, _data_function, _cache_key_function, callback) {
    logger.debug('ProcessWrapper');
    if (IS_CIRCUIT_BREAK) {
        logger.debug('ProcessWrapper:circuit break, exiting');
        callback(null);
    } else {
        ///////////////////////////////////////////////////////////////////////////////////////////////
        // Prepare values
        ///////////////////////////////////////////////////////////////////////////////////////////////
        var data_function_name = functionName(_data_function);
        var cache_key = _cache_key_function(Params, data_function_name);

        ///////////////////////////////////////////////////////////////////////////////////////////////
        // Check if cache exists
        ///////////////////////////////////////////////////////////////////////////////////////////////
        myCache.get(cache_key, function (err, value) {
            if (!(err) && value !== undefined) // There is cache
            {
                Params.isCached = true;
                _data_function(Params, value, function (err) // Call data method to fill result
                {
                    logger.debug('[ProcessWrapper]Pre Cached: (' + data_function_name + ')');
                    callback(null);
                });
            } else // No Cache exists
            {
                Params.isCached = false;
                logger.debug('[ProcessWrapper]Not Cached: (' + data_function_name + ')');
                var isCallbackRequired = true;

                var wrapped = async.timeout(function () {
                    try {
                        _data_function(Params, null, function (err, result) {
                            logger.debug('ProcessedWrapper after data_function calling');
                            if (!err) {
                                myCache.set(cache_key, result, _options.CACHE_TTL, function (err) {
                                    if (err) {
                                        logger.debug('[ProcessCache]Cache error: (' + data_function_name + ') ' + err);
                                    }
                                    logger.debug('[ProcessWrapper]Success: (' + data_function_name + ')');
                                    if (isCallbackRequired) {
                                        isCallbackRequired = false;
                                        callback(null);
                                    }
                                });
                            } else {
                                logger.debug('[ProcessWrapper]Error: (' + data_function_name + ') ' + err);
                                if (isCallbackRequired) {
                                    isCallbackRequired = false;
                                    circuitReset();
                                    callback('error');
                                }
                            }
                        });
                    } catch (exception) {
                        logger.debug('exception', exception);
                    }
                }, _options.CALL_TIMEOUT);
                wrapped(function (err) {
                    if (isCallbackRequired) {
                        isCallbackRequired = false;
                        circuitReset();
                        callback('500^타임아웃^');
                    }
                });
            }
        });
    }
};

//region ===state_connect_*===
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.state_connect_elasticsearch = function (callback) {
    logger.debug('state_connect_elasticsearch');
    var isCallbackRequired = true;
    if (IS_CIRCUIT_BREAK) {
        callback(null);
    } else if (!isElasticsearchOpen) {
        logger.debug('state_connect_elasticsearch connecting');
        lock.acquire('state_connect_elasticsearch', function (done) {
            if (!isElasticsearchOpen) {
                elasticsearchClient.ping({
                    requestTimeout: _options.CALL_TIMEOUT
                }, function (err) {
                    if (!err) {
                        isElasticsearchOpen = true;
                        isCallbackRequired = false;
                        callback(null);
                    } else {
                        isCallbackRequired = false;
                        callback('error');
                    }
                });
            } else {
                done();
                if (isCallbackRequired) {
                    callback(null);
                }
            }
        }, function (err, ret) //lock released
        {
            var x = 'vv';
        }, null);
    } else {
        callback(null);
    }
};

///////////////////////////////////////////////////////////////////////////////////////////////////
exports.state_connect_s3 = function (callback) {
    logger.debug('state_connect_s3');
    var isCallbackRequired = true;
    if (IS_CIRCUIT_BREAK) {
        callback(null);
    } else if (!isS3Open) {
        logger.debug('state_connect_s3 connecting');
        lock.acquire('state_connect_s3', function (done) {
            if (!isS3Open) {
                s3.getObject(_options.S3_PARAMS, function (err, data) {
                    if (!err) {
                        isS3Open = true;
                        isCallbackRequired = false;
                        callback(null);
                    } else {
                        isCallbackRequired = false;
                        callback('error');
                    }
                });
            } else {
                done();
                if (isCallbackRequired) {
                    callback(null);
                }
            }
        }, function (err, ret) //lock released
        {
            var x = 'vv';
        }, null);
    } else {
        callback(null);
    }
};

///////////////////////////////////////////////////////////////////////////////////////////////////
exports.state_connect_rest = function (callback) {
    logger.debug('state_connect_rest');
    var isCallbackRequired = true;
    if (IS_CIRCUIT_BREAK) {
        callback(null);
    } else if (!isRestOpen) {
        logger.debug('state_connect_rest connecting');
        lock.acquire('state_connect_rest', function (done) {
            if (!isRestOpen) {
                restClient.get(_options.REST_CHECK_URL, function (data, response) {
                    if (response.statusCode === 200) {
                        isRestOpen = true;
                        isCallbackRequired = false;
                        callback(null);
                    } else {
                        isCallbackRequired = false;
                        circuitReset();
                        callback('error');
                    }
                }).on('error', function (err) {
                    logger.debug('state_connect_rest ERR', err.code);
                    isCallbackRequired = false;
                    circuitReset();
                    callback('error');
                });
            } else {
                done();
                if (isCallbackRequired) {
                    callback(null);
                }
            }
        }, function (err, ret) //lock released
        {
            var x = 'vv';
        }, null);
    } else {
        callback(null);
    }
};


///////////////////////////////////////////////////////////////////////////////////////////////////
exports.state_connect_mariadb = function (callback) {
    logger.debug('state_connect_mariadb');
    if (IS_CIRCUIT_BREAK) {
        callback(null);
    } else if (!isMariaDbOpen) {
        logger.debug('state_connect_mariadb connecting');
        mariadb = mariadbClient.createPool({
            connectionLimit: _options.MARIADB_CONNECTION_LIMIT,
            host: _options.MARIADB_HOST,
            user: _options.MARIADB_USER,
            password: _options.MARIADB_PASSWORD,
            database: _options.MARIADB_DATABASE
        });
        lock.acquire('state_connect_mariadb', function (done) {
            if (!isMariaDbOpen) {
                mariadb.getConnection(function (err, connection) {
                    logger.debug('after mariadb connection, err=', err);
                    if (!err) {
                        isMariaDbOpen = true;
                        callback(null);
                    } else {
                        circuitReset();
                        callback('error');
                    }
                });
            } else {
                done();
                callback(null);
            }
        }, function (err, ret) //lock released
        {
        }, null);
    } else {
        callback(null);
    }
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.state_connect_cassandra = function (callback) {
    logger.debug('state_connect_cassandra');
    if (IS_CIRCUIT_BREAK) {
        callback(null);
    } else if (!isCassandraOpen) {
        logger.debug('state_connect_cassandra connecting');
        cassandradb = new cassandra.Client({contactPoints: _options.CASSANDRA_URL, keyspace: 'system'});
        lock.acquire('state_connect_cassandra', function (done) {
            if (!isCassandraOpen) {
                cassandradb.connect(function (err, result) {
                    logger.debug('after cassandra connection, err=', err, ', cassandradb.connected=', cassandradb.connected);
                    if (!err && cassandradb.connected) {
                        isCassandraOpen = true;
                        callback(null);
                    } else {
                        circuitReset();
                        callback('error');
                    }
                });
            } else {
                done();
                callback(null);
            }
        }, function (err, ret) //lock released
        {
        }, null);
    } else {
        callback(null);
    }
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.state_connect_mongo = function (callback) {
    logger.debug('state_connect_mongo');
    if (IS_CIRCUIT_BREAK) {
        callback(null);
    } else if (!isMongoDbOpen) {
        MongoClient.connect(_options.MONGODB_URL, {
            poolSize: _options.MONGODB_POOL_SIZE, connectTimeoutMS: _options.CALL_TIMEOUT
        }, function (err, db) {
            if (!err) {
                mongodb = db;
                isMongoDbOpen = true;
                callback(null);
            } else {
                circuitReset();
                callback('error');
            }
        });
    } else {
        callback(null);
    }
};
//endregion

///////////////////////////////////////////////////////////////////////////////////////////////////
exports.state_finalize = function (Params, callback) {
    logger.debug('state_finalize');
    if (Object.keys(Params.returnStructure).length > 0) {
        Params.res.setHeader('Content-Type', 'application/json; charset=utf-8');
        Params.res.end(JSON.stringify(Params.returnStructure[Object.keys(Params.returnStructure)[0]] || {}, null, 2));
    } else {
        Params.res.end();
    }
    callback(null);
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.circuitReset = function () {
    circuitReset();
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.get_IS_CIRCUIT_BREAK = function () {
    return IS_CIRCUIT_BREAK;
};

///////////////////////////////////////////////////////////////////////////////////////////////////
exports.initKafka = function (connStr, callback) {
    logger.debug('init_kafka');
    if (isKafkaOpen === false) {
        var HighLevelProducer = kafka.HighLevelProducer;
        var Client = kafka.Client;
        var client = new Client(connStr);
        var producer = new HighLevelProducer(client);

        producer.on('ready', function () {
            isKafkaOpen = true;
            kafkaproducer = producer;
            callback(null);
        });

        producer.on('error', function (err) {
            console.log('error kafka init', err);
            isKafkaOpen = false;
            callback(null);
        });
    } else {
        callback(null);
    }
};
///////////////////////////////////////////////////////////////////////////////////////////////////
exports.sendMessage = function (topic, kafka_msgs, callback) {
    if (isKafkaOpen) {
        kafkaproducer.send([{topic: topic, messages: kafka_msgs}], function (err, data) {
            if (err) {
                logger.debug('error send message');
            }
            callback('error');
        });
        callback(null);
    }
};


///////////////////////////////////////////////////////////////////////////////////////////////////
// Internal functions
///////////////////////////////////////////////////////////////////////////////////////////////////
function circuitReset() {
    isCassandraOpen = false;
    isMongoDbOpen = false;
    isMariaDbOpen = false;
    isRestOpen = false;
    isS3Open = false;
    isElasticsearchOpen = false;
    CIRCUIT_BREAKER_START_TIME = Date.now();
    IS_CIRCUIT_BREAK = true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function functionName(fun) {
    var ret = fun.toString();
    ret = ret.substr('function '.length);
    ret = ret.substr(0, ret.indexOf('('));
    return ret;
}

//region ===check*Connection===
///////////////////////////////////////////////////////////////////////////////////////////////////
function checkElasticsearchConnection(callback) {
    var isCallbackRequired = true;
    var wrapped = async.timeout(function () {
        elasticsearchClient.ping({
            requestTimeout: _options.CALL_TIMEOUT
        }, function (err) {
            if (!err) {
                isElasticsearchOpen = true;
                isCallbackRequired = false;
                callback(null);
            } else {
                isCallbackRequired = false;
                callback('error');
            }
        });
    }, _options.CALL_TIMEOUT);
    wrapped(function (err) {
        if (isCallbackRequired) {
            callback(err);
        }
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function checkS3Connection(callback) {
    var isCallbackRequired = true;
    var wrapped = async.timeout(function () {
        var s3tmp = new aws.S3();

        s3tmp.getObject(s3Params, function (err, data) {
            if (!err) {
                isS3Open = true;
                isCallbackRequired = false;
                callback(null);
            } else {
                isCallbackRequired = false;
                callback('error');
            }
        });
    }, _options.CALL_TIMEOUT);
    wrapped(function (err) {
        if (isCallbackRequired) {
            callback(err);
        }
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function checkRestConnection(callback) {
    var isCallbackRequired = true;
    var wrapped = async.timeout(function () {
        restClient.get(_options.REST_CHECK_URL, function (data, response) {
            if (response.statusCode === 200) {
                isRestOpen = true;
                isCallbackRequired = false;
                callback(null);
            } else {
                isCallbackRequired = false;
                callback('error');
            }
        }).on('error', function (err) {
            logger.debug('checkRestConnection ERR', err.code);
            isCallbackRequired = false;
            callback('error');
        });

    }, _options.CALL_TIMEOUT);
    wrapped(function (err) {
        if (isCallbackRequired) {
            callback(err);
        }
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function checkMariaDBConnection(callback) {
    var isCallbackRequired = true;
    var wrapped = async.timeout(function () {
        mariadb.getConnection(function (err, connection) {
            if (!err) {
                connection.query('select * from information_schema.TABLES limit 1', function (err, result, fields) {
                    if (!err) {
                        isMariaDbOpen = true;
                        connection.release();
                        isCallbackRequired = false;
                        callback(null);
                    } else {
                        isCallbackRequired = false;
                        callback('error');
                    }
                });
            } else {
                isCallbackRequired = false;
                callback('error');
            }
        });
    }, _options.CALL_TIMEOUT);
    wrapped(function (err) {
        if (isCallbackRequired) {
            callback(err);
        }
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function checkCassandraDBConnection(callback) {
    if (cassandradb.connected) {
        logger.debug('checkCassandraDBConnection: CONNECTED');
        var query = 'select * from system.peers limit 1';

        var isReturnRequired = true;
        var wrapped = async.timeout(function () {
            cassandradb.execute(query, function (err, result) {
                if (!err && cassandradb.connected) {
                    if (isReturnRequired) {
                        isCassandraOpen = true;
                        isReturnRequired = false;
                        callback(null);
                    }
                } else {
                    if (isReturnRequired) {
                        isReturnRequired = false;
                        callback(err);
                    }
                }
            });
        }, _options.CALL_TIMEOUT);

        wrapped(function (err) {
            if (isReturnRequired) {
                isReturnRequired = false;
                callback(err);
            }
        });
    } else if (cassandradb.connecting) {
        logger.debug('checkCassandraDBConnection: CONNECTING');
        callback('error');
    } else {
        logger.debug('checkCassandraDBConnection: BASE');
        cassandradb.connect(function (err) {
            if (!err && cassandradb.connected) {
                isCassandraOpen = true;
                callback(null);
            } else {
                callback('error');
            }
        });
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function checkMongoDBConnection(callback) {
    logger.debug('checkMongoDBConnection called');
    var isCallbackRequired = true;
    var wrapped = async.timeout(function () {
        MongoClient.connect(_options.MONGODB_URL, {
            poolSize: _options.MONGODB_POOL_SIZE, connectTimeoutMS: _options.CALL_TIMEOUT
        }, function (err, db) {
            if (!err) {
                mongodb = db;
                isCallbackRequired = false;
                logger.debug('SUCC:STEP1');
                callback(null);
            } else {
                isCallbackRequired = false;
                logger.debug('ERR:STEP2');
                callback('error');
            }
        });
    }, _options.CALL_TIMEOUT);
    wrapped(function (err) {
        if (isCallbackRequired) {
            logger.debug('ERR:STEP3');
            callback(err);
        }
    });
}

//endregion
