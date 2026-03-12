// import { BaseProp } from "./ui/scripts/models/propModels/baseProp";

type NodeID = string | number;

interface PropConfig {
  type: string;
  label?: string;
  default?: any;
  config?: any; //用于numericProp的如min,max等设置，或其他属性需要
  properties?: PropConfig[]; // 用于hubProp
  columns?: any[]; //用于viewProp: table
}

interface PortPropConfig extends PropConfig {
  direction?: "input" | "output";
}

/** 属性配置接口 */
interface PropType {
  id?: NodeID;
  type: string;
  label?: string;
  default?: any;
  config?: any; //用于numericProp的如min,max等设置，或其他属性需要
  properties?: import("./ui/scripts/models/propModels/baseProp.js").BaseProp[]; // 用于hubProp
  columns?: any[]; //用于viewProp: table
}

interface PortPropType extends PropType {
  direction?: "input" | "output";
}

interface NodeConfig {
  title: string;
  color: string;
  icon: string;
  content?: string;
  modelType?: "Node" | "Variable" | "InlineNode"; //基本逻辑节点 | 变量节点 | 内联节点
  inputs?: PortPropConfig[];
  outputs?: PortPropConfig[];
  properties?: PropConfig[];
  exProperties?: PropConfig[];
}

/** 节点类型定义 */
interface NodeType {
  title: string;
  color: string;
  icon: string;
  content?: string;
  modelType?: "Node" | "Variable" | "InlineNode"; //基本逻辑节点 | 变量节点 | 内联节点
  inputs?: PortPropType[];
  outputs?: PortPropType[];
  properties?: PropType[];
  exProperties?: PropType[];
}
