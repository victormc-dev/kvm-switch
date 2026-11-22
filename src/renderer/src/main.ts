import './styles/main.css'
import { KvmApp } from './app'

// 全局类型声明
declare global {
  interface Window {
    kvm: import('../../shared/types').KvmApi
  }
}

const app = new KvmApp()
app.init()
