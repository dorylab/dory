export declare const TokenClassConsts: {
    BINARY: string;
    BINARY_ESCAPE: string;
    COMMENT: string;
    COMMENT_QUOTE: string;
    DELIMITER: string;
    DELIMITER_CURLY: string;
    DELIMITER_PAREN: string;
    DELIMITER_PAREN_SQL: string;
    DELIMITER_SQUARE: string;
    IDENTIFIER: string;
    IDENTIFIER_QUOTE: string;
    KEYWORD: string;
    KEYWORD_SCOPE: string;
    NUMBER: string;
    NUMBER_FLOAT: string;
    NUMBER_BINARY: string;
    NUMBER_OCTAL: string;
    NUMBER_HEX: string;
    OPERATOR: string;
    OPERATOR_KEYWORD: string;
    OPERATOR_SYMBOL: string;
    PREDEFINED: string;
    STRING: string;
    STRING_DOUBLE: string;
    STRING_ESCAPE: string;
    TYPE: string;
    VARIABLE: string;
    WHITE: string;
};
export declare const postfixTokenClass: (token: string) => string;
export declare enum LanguageIdEnum {
    FLINK = 'flinksql',
    HIVE = 'hivesql',
    MYSQL = 'mysql',
    PG = 'pgsql',
    SPARK = 'sparksql',
    TRINO = 'trinosql',
    IMPALA = 'impalasql',
    DORIS = 'doris',
}
