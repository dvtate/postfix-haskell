
// Abstract base
interface DataType {

    // Used for typechecking
    compare(other) {}
};

enum UnderlyingPrimitives {
    I32, I64, F32, F64,
};

interface BasicType extends DataType {
    type: 
};

interface EnumType extends DataType {

};

interface StructType extends DataType {

};