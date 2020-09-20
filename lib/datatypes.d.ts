
// Abstract base
declare interface DataType {

    // Used for typecheckin
}

declare enum UnderlyingPrimitiveType {
    I32, I64, F32, F64,
}

declare interface BasicType extends DataType {
    type: UnderlyingPrimitiveType,

}

declare interface EnumType extends DataType {

}
        
declare interface StructType extends DataType {

}