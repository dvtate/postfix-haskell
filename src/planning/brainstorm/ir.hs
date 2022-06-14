module IR where
import Prelude

-- | WASM datatypes allowed on stack
data WASMType = I32 | I64 | F32 | F64
    deriving (Read, Show, Eq, Enum)

wasmTypeName :: WASMType -> String
wasmTypeName I32 = "i32"
wasmTypeName I64 = "i64"
wasmTypeName F32 = "f32"
wasmTypeName F64 = "f64"

-- | Our IR language
-- | Values/Operations that act on the WASM stack
data DataExpr =
    I32Lit Int      -- ^ Compiles to i32.const
    | I64Lit Int    -- ^ Compiles to i64.const
    | F32Lit Float  -- ^ Compiles to f32.const
    | F64Lit Float  -- ^ Compiles to f64.const
    | LocalExpr Int     -- ^ Refers to indexed local function
    | InstrExpr     -- ^ Result of an instruction
        String      -- ^ Mnemonic
        [DataExpr]  -- ^ Stack arguments
        WASMType    -- ^ Result type
    | CallExpr      -- ^ Call a function
        String      -- ^ Identifier for function
        [DataExpr]  -- ^ Stack arguments
        WASMType    -- ^ Result types
    deriving (Read, Show, Eq)

-- Gets result wasm types
getDataType :: ExportedFun -> DataExpr -> [WASMType]
getDataType fun (I32Lit _) = [I32]
getDataType fun (I64Lit _) = [I64]
getDataType fun (F32Lit _) = [F32]
getDataType fun (F64Lit _) = [F64]
getDataType fun (LocalExpr i) = [funLocals fun !! i]
getDataType fun (InstrExpr _ _ t) = [t]
getDataType fun (CallExpr _ _ ts) = [ts]

-- | Expressions which don't directly act on the stack
data NonDataExpr =
    BranchExpr      -- ^ Branching code
        [DataExpr]  -- ^ Conditions
        [DataExpr]  -- ^ Actions
        [Int]       -- ^ Output Identifiers

-- | Exported function
data ExportedFun = FunExport {
    funId :: String,            -- ^ Identifier
    funParams :: [WASMType],    -- ^ Params
    funLocals :: [WASMType],    -- ^ Locals
    funResults :: [DataExpr]    -- ^ Result exprs
} deriving (Read, Show, Eq)

type Module = [ExportedFun]
data Context = Ctx Module ExportedFun

-- addLocal :: ExportedFun -> WASMType -> (Int, ExportedFun)
-- addLocal fun@(FunExport id params locals results) t =
--     let fun' = FunExport id params (locals ++ [t]) results
--     in (length locals, fun')

-- | Expressions can be compiled to WASM
class Expr a where
    -- | Compile
    outExpr :: Context -> a -> (String, Context)

-- Our IR can compile to WASM
instance Expr DataExpr where
    outExpr ctx (I32Lit n) = ("(i32.const " ++ show n ++ ")", ctx)
    outExpr ctx (I64Lit n) = ("(i64.const " ++ show n ++ ")", ctx)
    outExpr ctx (F32Lit n) = ("(f32.const " ++ show n ++ ")", ctx)
    outExpr ctx (F64Lit n) = ("(f64.const " ++ show n ++ ")", ctx)
    outExpr ctx (LocalExpr n)  = ("(local.get " ++ show n ++ ")", ctx)
    outExpr ctx (InstrExpr instr args _) = impl [] ctx args
        where
            impl ret ctx [] = ("(" ++ instr ++ ret ++ ")", ctx)
            impl ret ctx (arg : args) = impl (ret ++ " " ++ str) ctx' args
                where (str, ctx') = outExpr ctx arg
    outExpr ctx (CallExpr id args _) = impl [] ctx args
        where
            impl ret ctx [] = ("(call $" ++ id ++ ret ++ ")", ctx)
            impl ret ctx (arg : args) = impl (ret ++ " " ++ str) ctx' args
                where (str, ctx') = outExpr ctx arg

-- | Compile program to a wasm string
outModule :: Module -> String
outModule funs =
    let
        outModule' :: [(ExportedFun, String)] -> Int -> [ExportedFun] -> ([ExportedFun], [String])
        outModule' ret idx funs
            | idx >= length funs = unzip $ reverse ret
            | otherwise = outModule' ret' (idx + 1) funs'
                where
                    f = funs !! idx
                    getFunResRec :: [String] -> Context -> [DataExpr] -> (Context, [String])
                    getFunResRec ret ctx [] = (ctx, reverse ret)
                    getFunResRec ret ctx (e : es) =
                        let (str, ctx') = outExpr ctx e
                        in getFunResRec (str : ret) ctx' es
                    (Ctx funs' f', results) = getFunResRec [] (Ctx funs f) (funResults f)
                    ret' = (f', concat results) : ret

        (funs', bodies) = outModule' [] 0 funs

        resultSig f = "(result"
            ++ concatMap ((" " ++) . wasmTypeName)
                (concatMap (getDataType f) (funResults f))
            ++ ")"
        paramSig f = "(param" ++ concatMap ((" " ++) . wasmTypeName) (funParams f) ++ ")"
        localSig f = "(local" ++ concatMap ((" " ++) . wasmTypeName) (funParams f) ++ ")"

        funSig :: ExportedFun -> String -> String
        funSig f body = "(func $" ++ funId f ++ " " ++ paramSig f ++ " " ++ resultSig f
            ++ " " ++ localSig f ++ " " ++ body
            ++ ") (export \"" ++ funId f ++ "\" (func $" ++ funId f ++ ")"
    in
        "(module " ++ concat (zipWith funSig funs' bodies) ++ ")"

-- demo
exampleFunction :: ExportedFun
exampleFunction = FunExport "incr" [I32] [] [
    InstrExpr "i32.add" [LocalExpr 0, I32Lit 1] I32]
main :: IO ()
main = putStrLn $ outModule [exampleFunction]