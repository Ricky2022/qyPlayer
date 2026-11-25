/** 内置模板（PRD 8.4）：一组生成规则，决定每页张数、转场和入场动画的倾向。 */
export interface Template {
    id: string;
    name: {
        zh: string;
        en: string;
    };
    description: {
        zh: string;
        en: string;
    };
    /** 照片页包含 1、2、3、4 张图的权重 */
    sizeWeights: readonly [number, number, number, number];
    /** 页间转场的权重（首页固定为 fade） */
    transitions: readonly {
        type: "fade" | "slide" | "zoom";
        weight: number;
    }[];
    /** 多图页内各素材入场动画的权重 */
    enters: readonly {
        type: "fade" | "slide" | "scale";
        weight: number;
    }[];
}

export const TEMPLATES: readonly Template[] = [
    {
        id: "clean",
        name: {zh: "简洁", en: "Clean"},
        description: {zh: "以淡入淡出为主，单图页比例高", en: "Mostly fades, with a high share of single-photo pages"},
        sizeWeights: [5, 3, 1, 1],
        transitions: [
            {type: "fade", weight: 7},
            {type: "slide", weight: 1},
            {type: "zoom", weight: 1},
        ],
        enters: [
            {type: "fade", weight: 8},
            {type: "scale", weight: 2},
        ],
    },
    {
        id: "lively",
        name: {zh: "活泼", en: "Lively"},
        description: {zh: "以滑动和缩放为主，多图页比例高", en: "Mostly slides and zooms, with a high share of multi-photo pages"},
        sizeWeights: [1, 3, 3, 3],
        transitions: [
            {type: "slide", weight: 4},
            {type: "zoom", weight: 3},
            {type: "fade", weight: 1},
        ],
        enters: [
            {type: "slide", weight: 4},
            {type: "scale", weight: 4},
            {type: "fade", weight: 1},
        ],
    },
    {
        id: "classic",
        name: {zh: "经典", en: "Classic"},
        description: {zh: "各种转场和版式均衡搭配", en: "A balanced mix of transitions and layouts"},
        sizeWeights: [3, 3, 2, 2],
        transitions: [
            {type: "fade", weight: 3},
            {type: "slide", weight: 3},
            {type: "zoom", weight: 2},
        ],
        enters: [
            {type: "fade", weight: 3},
            {type: "slide", weight: 3},
            {type: "scale", weight: 3},
        ],
    },
];

export const findTemplate = function findTemplate(id: string): Template | undefined {
    return TEMPLATES.find((t) => t.id === id);
};
