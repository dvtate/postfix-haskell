
declare module "lex" {
    export default function lex(src : string) : Token[];
    
}

export enum TokenType {
    Literal = 0, Separator = 1, Symbol = 2, Identifier = 3,
}

class LexerToken {
    token: string;
    type: TokenType;
    subtype: string; // TODO enumerate
}