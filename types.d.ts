type NodeID = string | number;
type NodePropConfig =
  | PropConfig
  | PortPropConfig
  | HubPropConfig
  | ViewPropConfig
  | OptionsPropConfig
  | NumericPropConfig;

interface PropConfig {
  type: string;
  value?: any;
  label?: string;
  description?: string;
  default?: any;
  config?: any; //用于numericProp的如min,max等设置，或其他属性需要
  columns?: any[]; //用于viewProp: table
}

interface OptionsPropConfig extends PropConfig {
  type: "options" | "select";
  isModeSwitcher?: boolean; //是否是模式切换器
  options?: string[];
}

interface HubPropConfig extends PropConfig {
  type: "hub";
  properties?: NodePropConfig[];
  layout?: "single" | "double" | "mix";
}

interface NumericPropConfig extends PropConfig {
  type: "numeric" | "number" | "slider" | "range" | "integer";
  min?: number;
  max?: number;
}

interface ViewPropConfig extends PropConfig {
  type: "view";
}

interface PortPropConfig extends PropConfig {
  type: "port";
  multiConnect?: boolean;
  direction?: "input" | "output";
  requireType?: string;
  returnType?: string;
  connectNum?: number;
  NotSetWarning?: boolean | string;
  valueType?: string;
}

type IPropType =
  | PropType
  | import("./ui/scripts/models/propModels/baseProp.js").BaseProp;

interface PropType {
  id?: NodeID;
  type: string;
  value: any;
  description?: string;
  label?: string;
  default?: any;
  config?: any; //用于numericProp的如min,max等设置，或其他属性需要
  properties?: import("./ui/scripts/models/propModels/baseProp.js").BaseProp[]; // 用于hubProp
  columns?: any[]; //用于viewProp: table
}

interface PortPropType extends PropType {
  direction?: "input" | "output";
  requireType?: string;
  returnType?: string;
}

interface HubPropType extends PropType {
  properties?: PropType[];
  layout?: "single" | "double" | "mix";
}

interface NodeConfig {
  title: string;
  label?: string;
  color: string;
  icon: string;
  active?: boolean;
  width?: number;
  height?: number;
  content?: string;
  modelType?: "Node" | "Variable" | "InlineNode"; //基本逻辑节点 | 变量节点 | 内联节点
  inputs?: PortPropConfig[];
  outputs?: PortPropConfig[];
  properties?: Array<NodePropConfig>;
  exProperties?: Record<string, Array<NodePropConfig>>;
}

/** 节点类型定义 */
interface NodeType extends EventTarget {
  id: NodeID;
  title: string;
  label?: string;
  color: string;
  icon: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  modelType?: "Node" | "Variable" | "InlineNode"; //基本逻辑节点 | 变量节点 | 内联节点
  inputs?: PortPropType[];
  outputs?: PortPropType[];
  properties?: PropType[];
  exProperties?: PropType[];
}
