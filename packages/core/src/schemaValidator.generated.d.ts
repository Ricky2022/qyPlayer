// schemaValidator.generated.js 的类型。校验函数由 `pnpm schema:build` 生成。
export interface SchemaError {
    instancePath: string;
    message?: string;
}

export interface SchemaValidator {
    (data: unknown): boolean;
    /** 最近一次校验失败的原因；通过时为 null */
    errors?: SchemaError[] | null;
}

export const validate: SchemaValidator;
export default validate;
