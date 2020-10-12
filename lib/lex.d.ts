

export enum TokenType {
    String,
    Number,
    ContainerOpen,
    ContainerClose,
    Identifier,
}

declare class LexerToken {
    token: string;
    type: TokenType;
    subtype?: string; // TODO enumerate
    position: number;
}

export function lex(src : string) : LexerToken[]
