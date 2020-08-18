
declare module "lex" {
    export default function lex(src : string) : Token[];
}

enum TokenType {
    Literal = 0, Separator = 1, Symbol = 2, Identifier = 3,
}

class Token {
    token: string;
    type: TokenType;
    subtype: string; // TODO enumerate
}