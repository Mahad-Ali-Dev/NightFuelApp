declare module 'opossum' {
    export default class CircuitBreaker {
        constructor(action: Function, options?: any);
        fire(...args: any[]): Promise<any>;
        fallback(action: Function | any): this;
        on(event: string, callback: Function): this;
    }
}
