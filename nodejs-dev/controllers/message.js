/**
 * Created by felix on 2017-06-06.
 */
///////////////////////////////////////////////////////////////////////////////////////////////////
// 어플리케이션 메시지
///////////////////////////////////////////////////////////////////////////////////////////////////
var Message = {
    elasticsearch_connection_error_500: '500^elasticsearch 접속 오류입니다.^',
    elasticsearch_data_error_500: '500^elasticsearch 데이타 오류입니다.^',
    s3_connection_error_500: '500^S3 접속 오류입니다.^',
    s3_data_error_500: '500^S3 데이타 오류입니다.^',
    rest_connection_error_500: '500^REST API 접속 오류입니다.^',
    rest_data_error_500: '500^REST API 데이타 오류입니다.^',
    mariadb_connection_error_500: '500^마리아 DB 접속 오류입니다.^',
    mariadb_data_error_500: '500^마리아 DB 데이타 오류입니다.^',
    mongodb_connection_error_500: '500^몽고 DB 접속 오류입니다.^',
    cassandra_connection_error_500: '500^카산드라 DB 접속 오류입니다.^',
    cassandra_data_error_500: '500^카산드라 DB 데이타 오류입니다.^',
    circuit_breaker_activated_404: '404^일시적 장애가 발생하였습니다. 잠시 후 다시 이용하세요.^',
    circuit_breaker_engaging_500: '500^일시적 장애가 발생중입니다. 잠시 후 다시 이용하세요.^',
    generic_error_403: '403^오류가 발생하였습니다.^',
    application_no_channel_403: '403^채널이 없습니다.^',
    application_no_vod_403: '403^VOD 목록이 없습니다.^',
    application_key_mismatch_403: '403^API 키값이 다릅니다.^'
};
exports.get_Message = function()
{
    return Message;
};
