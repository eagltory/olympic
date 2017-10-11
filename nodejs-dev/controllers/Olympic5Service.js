'use strict';
var engine = require('./engine.js');
var message = require('./message.js');
var async = new require('async');
var log4js = require('log4js');
var logger = log4js.getLogger();
var aws = require('aws-sdk');
const NodeCache = require('node-cache');
const myCBCache = new NodeCache();
const CB_RESPONSE_KEY = 'CBD';
const CB_RESPONSE_TTL_SECONDS = 30;

exports.initialize = function (callback) {
    logger.debug('initialization start');
    var _options = {
        CALL_TIMEOUT: 500, // CB 발생 확인을 위한 Function timeout (밀리초)
        CIRCUIT_BREAKER_DURATION: 10, //얼마만에 한번씩 CB 상태 복구 테스트를 진행하는지 결정 (초)
        CACHE_TTL: 2, // 데이타 캐시 기간(초)
        MONGODB_POOL_SIZE: 1, //몽고DB Connection Pool 크기
        MONGODB_URL: 'mongodb://localhost:27017/vod',
        MONGODB_CB_QUERY: '',
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
        CIRCUIT_BREAKER_TARGET: ['mongodb']
        //        CIRCUIT_BREAKER_TARGET: ['mongodb', 'cassandradb', 'mariadb', 'rest', 's3', 'elasticsearch']
    };
    logger.setLevel('INFO'); //DEBUG or ERROR
    engine.set_options(_options);

    var isCallbackRequired = true;
    async.waterfall([// async.apply(engine.state_connect_cassandra), // Conntect cassandra
        // async.apply(engine.state_connect_mariadb),
        // async.apply(engine.state_connect_rest)
        async.apply(engine.state_connect_mongo)], function (error) {
        if (error) {
            isCallbackRequired = false;
            logger.debug('initialize error=', error);
            callback('error'); // For error, first API call will handle initialization
        }
    });
    if (isCallbackRequired) {
        logger.debug('initialization success');
        callback(null);
    }
};

exports.supercontent_vProgramIdContentIdCornerIdGET = function (args, res, next) {
    /**
     * 특정 프로그램,특정 회차의 메타 정보 검색 - VodGetMeta()
     * Vod 특정 프로그램의 특정 회차의 메타데이타를 검색한다.
     *
     * deviceTypeId String 요청하는 디바이스명을 입력한다. 형태는 'pc', 'smarttv','ios', 'android'중 하나를 지정한다. [pc]
     * marketTypeId String 요청하는 클라이언트가 앱인 경우(ios, android), 앱스토어의 이름을  입력한다. 만약 앱이 아닌 경우에는 'generic'으로 입력한다. 모바일인 경우는 'tstore', 'google','itunes'중 하나를 지정한다. [tstore]
     * apiAccessCredential String 본 API를 접근하기 위한 키. 업체별 또는 앱 별로 발급된다. [dummykey]
     * programId String 획득하고자 하는 program의 Id [3]
     * contentId String 검색할 Content ID
     * cornerId String 검색할 Corner ID
     * returns inline_response_200_1
     **/
    var returnStructure = {};
    returnStructure['application/json'] = {
        "result": {
            "episodeTitle": "회차제목",
            "programTitle": "프로그램제목",
            "image": "이미지",
            "episodeNo": "회차번호",
            "vodTitle": "vod제목",
            "id": "아이디",
            "programId": "프로그램ID"
        },
        "returnCode": "200",
        "function": "VodGetMeta",
        "title": "특정 프로그램,특정 회차의 메타 정보 검색",
        "message": "성공",
        "version": "0.1"
    };
    var Params = {
        args: args, res: res, returnStructure: returnStructure
    };
    async.waterfall([async.apply(engine.state_checkCircuit), //써킷 브레이커 상태 확인

        ///////////////////////////////////////////////////////////////////////////////////////
        // MongoDB process
        ///////////////////////////////////////////////////////////////////////////////////////
        async.apply(engine.state_connect_mongo), //몽고DB 접속
        async.apply(engine.ProcessWrapper, Params, _getmongoContent, _getCacheKey),
        async.apply(_StatePopulateResult, Params), //결과 조립

        ///////////////////////////////////////////////////////////////////////////////////////
        // CassandraDB process
        ///////////////////////////////////////////////////////////////////////////////////////
        // async.apply(engine.state_connect_cassandra), //카산드라DB 접속
        // async.apply(engine.ProcessWrapper, Params, _getcassandraContent, _getCacheKey),
        // async.apply(_StatePopulateResultCassandra, Params), //결과 조립

        ///////////////////////////////////////////////////////////////////////////////////////
        // MariaDB process
        ///////////////////////////////////////////////////////////////////////////////////////
        // async.apply(engine.state_connect_mariadb), //마리아 DB 접속
        // async.apply(engine.ProcessWrapper, Params, _getmariaContent, _getCacheKey),
        // async.apply(_StatePopulateResultMaria, Params), //결과 조립

        ///////////////////////////////////////////////////////////////////////////////////////
        // RESTful API process
        ///////////////////////////////////////////////////////////////////////////////////////
        // async.apply(engine.state_connect_rest), //RESTful API 접속
        // async.apply(engine.ProcessWrapper, Params, _getrestContent, _getCacheKey),
        // async.apply(_StatePopulateResultRest, Params), //결과 조립

        ///////////////////////////////////////////////////////////////////////////////////////
        // S3 API process
        ///////////////////////////////////////////////////////////////////////////////////////
        // async.apply(engine.state_connect_s3), //S3 API 접속
        // async.apply(engine.ProcessWrapper, Params, _gets3Content, _getCacheKey),
        // async.apply(_StatePopulateResultS3, Params), //결과 조립

        ///////////////////////////////////////////////////////////////////////////////////////
        // Elasticsearch API process
        ///////////////////////////////////////////////////////////////////////////////////////
        // async.apply(engine.state_connect_elasticsearch), //S3 API 접속
        // async.apply(engine.ProcessWrapper, Params, _getElasticsearchContent, _getCacheKey),
        // async.apply(_StatePopulateResultElasticsearch, Params), //결과 조립

        async.apply(engine.state_finalize, Params) //결과 전송

    ], function (error, result) {
        if (error) {
            logger.debug('ERROR|[checkAccessKey] Error:' + error);
            var split_string = error.split('^');
            if (split_string.length < 2) {
                logger.debug('ERROR|[checkAccessKey] BAD error message :' + error);
            }
            returnStructure['application/json']['result']['count'] = '0';
            returnStructure['application/json']['result']['list'] = [];
            returnStructure['application/json']['returnCode'] = split_string[0];
            returnStructure['application/json']['message'] = split_string[1];
            returnStructure['application/json']['function'] = returnStructure['application/json']['function'] + split_string[2];
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            var return_code = parseInt(split_string[0]);
            if(return_code >= 200)
            {
                res.statusCode = return_code;
            }
            else
            {
                res.statusCode = 500;
            }
            res.end(JSON.stringify(returnStructure[Object.keys(returnStructure)[0]] || {}, null, 2));
            return false;
        }
    });
};

///////////////////////////////////////////////////////////////////////////////////////////////////
// lock & cache key는 기능별로 수정되어야 한다.
//
// data_function_name의 특성에 따라 키값이 달라질 수 있다.
///////////////////////////////////////////////////////////////////////////////////////////////////
function _getCacheKey(Params, data_function_name) {
    var key = null;
    switch (data_function_name) {
        default:
            key = data_function_name + '^' + Params.args['programId'].value + Params.args['contentId'].value + Params.args['cornerId'].value;
            break;
    }
    return key;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Database Function
///////////////////////////////////////////////////////////////////////////////////////////////////
function _getmongoContent(Params, cachedData, callback) {
    if (cachedData !== null) //캐시 호출 처리, 캐시가 있다는 것은 ApiKey가 동일하다는 것
    {
        Params.superContent_v = cachedData;
        callback(null, cachedData);
    } else {
        engine.get_mongodb().collection('superContent_V')
            .find({
                $and: [{
                    ProgramID: Params.args['programId'].value
                }, {
                    ContentID: Params.args['contentId'].value
                }, {
                    CornerID: parseInt(Params.args['cornerId'].value)
                }]
            })
            .limit(1)
            .toArray(function (err, docs) {
                if ((err) || !('length' in docs)) {
                    callback(message.get_Message().generic_error_403 + '_getUHDChannel:' + err);
                } else {
                    Params.superContent_v = docs[0];
                    callback(null, docs[0]);
                }
            });
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _getcassandraContent(Params, cachedData, callback) {
    logger.debug('_getcassandraContent called');
    if (cachedData !== null) //캐시 호출 처리, 캐시가 있다는 것은 ApiKey가 동일하다는 것
    {
        logger.debug('_getcassandraContent cache call');
        Params.sampleCassandraData = cachedData;
        callback(null, cachedData);
    } else {
        logger.debug('_getcassandraContent real call');
        var query = 'SELECT * from vod.supercontent_v limit 10';

        var client = engine.get_cassandradb();
        client.execute(query, function (err, result) {
            if (!err) {
                Params.sampleCassandraData = result.rows[0];
                logger.debug('_getcassandraContent cassandradb success');
                callback(null, Params.sampleCassandraData);
            } else {
                logger.debug('_getcassandraContent cassandradb fail');
                engine.circuitReset();
                callback(message.get_Message().cassandra_data_error_500 + '_getcassandraContent:' + err);
            }
        });
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _StatePopulateResultCassandra(Params, callback) {
    if (engine.get_IS_CIRCUIT_BREAK()) //써킷 브레이크 상태의 응답
    {
        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = '써킷 브레이킹 상태입니다.';
        callback(null);
    } else {
        Params.returnStructure['application/json']['result']['programTitle'] = Params.sampleCassandraData.programid;
        Params.returnStructure['application/json']['result']['image'] = Params.sampleCassandraData.contentid;
        Params.returnStructure['application/json']['result']['episodeNo'] = Params.sampleCassandraData.data;

        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = 'cassandradb success, cached:' + Params.isCached;
        callback(null);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _getmariaContent(Params, cachedData, callback) {
    logger.debug('_getmariaContent called');
    if (cachedData !== null) //캐시 호출 처리, 캐시가 있다는 것은 ApiKey가 동일하다는 것
    {
        logger.debug('_getmariaContent cache call');
        Params.sampleMariaContent = cachedData;
        callback(null, cachedData);
    } else {
        logger.debug('_getmariaContent real call');
        var query = 'SELECT * from pooq.supercontentv limit 1';
        var client = engine.get_mariadb();

        client.getConnection(function (err, connection) {
            if (!err) {
                connection.query(query, function (err, result, fields) {
                    if (!err) {
                        Params.sampleMariaContent = result[0];
                        connection.release();
                        callback(null, Params.sampleMariaContent);
                    } else {
                        engine.circuitReset();
                        callback(message.get_Message().mariadb_data_error_500 + '_getmariaContent:' + err);
                    }
                });
            } else {
                engine.circuitReset();
                callback(message.get_Message().mariadb_connection_error_500 + '_getmariaContent:' + err);
            }
        });
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _StatePopulateResultMaria(Params, callback) {
    if (engine.get_IS_CIRCUIT_BREAK()) //써킷 브레이크 상태의 응답
    {
        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = '써킷 브레이킹 상태입니다.';
        callback(null);
    } else {
        Params.returnStructure['application/json']['result']['programTitle'] = Params.sampleMariaContent.Title;
        Params.returnStructure['application/json']['result']['image'] = Params.sampleMariaContent.ProgramID;
        Params.returnStructure['application/json']['result']['episodeNo'] = Params.sampleMariaContent.ContentID;

        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = 'mariadb success, cached:' + Params.isCached;
        callback(null);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _getrestContent(Params, cachedData, callback) {
    logger.debug('_getrestContent called');
    if (cachedData !== null) //캐시 호출 처리, 캐시가 있다는 것은 ApiKey가 동일하다는 것
    {
        logger.debug('_getrestContent cache call');
        Params.sampleRestContent = cachedData;
        callback(null, cachedData);
    } else {
        logger.debug('_getrestContent real call');

        var client = engine.get_rest();

        client.get('http://localhost:8090/echo?request=HelloWorld', function (data, response) {
            logger.debug('response.statusCode=', response.statusCode);
            if (response.statusCode === 200) {
                logger.debug('resultcode=', data.resultcode);
                logger.debug('resultmessage=', data.resultmessage);
                Params.sampleRestContent = data.resultmessage;
                callback(null, Params.sampleRestContent);
            } else {
                engine.circuitReset();
                callback(message.get_Message().rest_data_error_500 + '_getrestContent:', response.statusCode);
            }

        }).on('error', function (err) {
            logger.debug('_getrestContent ERR', err.code);
            engine.circuitReset();
            callback(message.get_Message().rest_connection_error_500 + 'error:', err.code);
        });

    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _StatePopulateResultRest(Params, callback) {
    if (engine.get_IS_CIRCUIT_BREAK()) //써킷 브레이크 상태의 응답
    {
        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = '써킷 브레이킹 상태입니다.';
        callback(null);
    } else {
        Params.returnStructure['application/json']['result']['programTitle'] = Params.sampleRestContent; //HelloWorld
        Params.returnStructure['application/json']['result']['image'] = '이미지 URL이 들어있어야 함.';
        Params.returnStructure['application/json']['result']['episodeNo'] = '5000';

        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = 'rest success, cached:' + Params.isCached;
        callback(null);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _gets3Content(Params, cachedData, callback) {
    logger.debug('_gets3Content called');
    if (cachedData !== null) //캐시 호출 처리, 캐시가 있다는 것은 ApiKey가 동일하다는 것
    {
        logger.debug('_gets3Content cache call');
        Params.sampleS3Content = cachedData;
        callback(null, cachedData);
    } else {
        logger.debug('_gets3Content real call');

        const myS3 = engine.get_s3();

        myS3.getObject({Bucket: 'felix-test-1', Key: 'sample.json'}, function (err, data) {
            if (!err) {
                Params.sampleS3Content = JSON.parse(data.Body.toString('utf-8'));
                callback(null, Params.sampleS3Content);
            } else {
                logger.debug('_gets3Content ERR', err);
                engine.circuitReset();
                callback(message.get_Message().s3_connection_error_500 + 'error:', err);
            }
        });
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _StatePopulateResultS3(Params, callback) {
    if (engine.get_IS_CIRCUIT_BREAK()) //써킷 브레이크 상태의 응답
    {
        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = '써킷 브레이킹 상태입니다.';
        callback(null);
    } else {

        logger.debug('_StatePopulateResultS3, Params.sampleS3Content:', Params.sampleS3Content);
        Params.returnStructure['application/json']['result']['programTitle'] = 'S3 JSON 내용=' + Params.sampleS3Content.record;

        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = 'rest success, cached:' + Params.isCached;
        callback(null);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _getElasticsearchContent(Params, cachedData, callback) {
    logger.debug('_getElasticsearchContent called');
    if (cachedData !== null) //캐시 호출 처리, 캐시가 있다는 것은 ApiKey가 동일하다는 것
    {
        logger.debug('_getElasticsearchContent cache call');
        Params.sampleS3Content = cachedData;
        callback(null, cachedData);
    } else {
        logger.debug('_getElasticsearchContent real call');

        var client = engine.get_elasticsearch();

        client.search({
            index: 'shakespeare', body: {
                query: {
                    match: {
                        speaker: 'PRINCE'
                    }
                }
            }
        }).then(function (body) {
            Params.sampleElasticsearchContent = body.hits.hits;
            callback(null, Params.sampleElasticsearchContent);
        }, function (err) {
            logger.debug('_getElasticsearchContent ERR', err);
            engine.circuitReset();
            callback(message.get_Message().elasticsearch_data_error_500 + 'error:', err);
        });
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function _StatePopulateResultElasticsearch(Params, callback) {
    if (engine.get_IS_CIRCUIT_BREAK()) //써킷 브레이크 상태의 응답
    {
        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = '써킷 브레이킹 상태입니다.';
        callback(null);
    } else {

        // logger.debug('_StatePopulateResultElasticsearch, Params.sampleElasticsearchContent:', Params.sampleElasticsearchContent);
        Params.returnStructure['application/json']['result']['programTitle'] = 'Elasticsearch JSON 내용=' + Params.sampleElasticsearchContent[0]._source.play_name;

        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = 'rest success, cached:' + Params.isCached;
        callback(null);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
//결과를 저장한다. IS_CIRCUIT_BREAK에 대한 처리를 하여야 한다.
///////////////////////////////////////////////////////////////////////////////////////////////////
function _StatePopulateResult(Params, callback) {
    if (engine.get_IS_CIRCUIT_BREAK()) //써킷 브레이크 상태의 응답
    {
        Params.res.statusCode = 500;
        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = '써킷 브레이킹 상태입니다.';
        callback(null);
    } else //정상응답
    {
        var epNumber = parseInt(Params.superContent_v['ContentNumber']);
        if (isNaN(epNumber)) {
            Params.returnStructure['application/json']['result']['episodeTitle'] = Params.superContent_v['Title_1'] + ' ' + Params.superContent_v['Title'];
        } else {
            Params.returnStructure['application/json']['result']['episodeTitle'] = Params.superContent_v['Title_1'] + ' ' + epNumber + '회 ' + Params.superContent_v['Title'];
        }
        Params.returnStructure['application/json']['result']['programTitle'] = Params.superContent_v['Title_1'];
        Params.returnStructure['application/json']['result']['image'] = Params.superContent_v['ContentImg'];
        Params.returnStructure['application/json']['result']['episodeNo'] = epNumber;
        Params.returnStructure['application/json']['result']['vodTitle'] = Params.superContent_v['Title'];
        Params.returnStructure['application/json']['result']['id'] = Params.superContent_v['ContentID'];
        Params.returnStructure['application/json']['result']['programId'] = Params.superContent_v['ProgramID'];
        Params.returnStructure['application/json']['returnCode'] = '200';
        Params.returnStructure['application/json']['message'] = 'success';
        callback(null);
    }
}

// function _StatePopulateResult(Params, callback) {
//     if (engine.get_IS_CIRCUIT_BREAK()) //써킷 브레이크 상태의 응답
//     {
//         logger.debug('CB Response');
//         myCBCache.get(CB_RESPONSE_KEY, function (err, value) {
//             if (!err && value !== undefined) {
//                 Params.returnStructure['application/json'] = value;
//                 Params.returnStructure['application/json']['function'] = Params.returnStructure['application/json']['function'] + " (써킷브레이커 상태, CB_Cache 사용)";
//                 callback(null);
//             } else {
//                 Params.returnStructure['application/json'].returnCode = '403';
//                 Params.returnStructure['application/json'].message = '오류가 발생하였습니다. 잠시 뒤에 사용해주세요';
//                 Params.returnStructure['application/json']['function'] = Params.returnStructure['application/json']['function'] + " (써킷브레이커 상태)";
//                 Params.returnStructure['application/json']['result']['count'] = '0';
//                 Params.returnStructure['application/json']['result']['list'] = [];
//                 Params.res.statusCode = 500;
//                 callback(null);
//             }
//         });
//     } else //정상응답
//     {
//         var epNumber = parseInt(Params.superContent_v['ContentNumber']);
//         if (isNaN(epNumber)) {
//             Params.returnStructure['application/json']['result']['episodeTitle'] = Params.superContent_v['Title_1'] + ' ' + Params.superContent_v['Title'];
//         } else {
//             Params.returnStructure['application/json']['result']['episodeTitle'] = Params.superContent_v['Title_1'] + ' ' + epNumber + '회 ' + Params.superContent_v['Title'];
//         }
//         Params.returnStructure['application/json']['result']['programTitle'] = Params.superContent_v['Title_1'];
//         Params.returnStructure['application/json']['result']['image'] = Params.superContent_v['ContentImg'];
//         Params.returnStructure['application/json']['result']['episodeNo'] = epNumber;
//         Params.returnStructure['application/json']['result']['vodTitle'] = Params.superContent_v['Title'];
//         Params.returnStructure['application/json']['result']['id'] = Params.superContent_v['ContentID'];
//         Params.returnStructure['application/json']['result']['programId'] = Params.superContent_v['ProgramID'];
//         Params.returnStructure['application/json']['returnCode'] = '200';
//         Params.returnStructure['application/json']['message'] = 'success';
//         myCBCache.get(CB_RESPONSE_KEY, function (err, value) {
//             if (!err && value !== undefined) {
//                 callback(null);
//             } else {
//                 logger.debug('CB_Response refresh');
//                 Params.returnStructure['application/json']['function'] = Params.returnStructure['application/json']['function'] + " (CB Cache update)";
//                 myCBCache.set(CB_RESPONSE_KEY, Params.returnStructure['application/json'], CB_RESPONSE_TTL_SECONDS, function (err) {
//                     callback(null);
//                 });
//             }
//         });
//     }
// }
