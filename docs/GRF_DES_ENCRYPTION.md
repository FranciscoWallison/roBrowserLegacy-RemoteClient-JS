# Como Remover Criptografia DES de Arquivos GRF

## 🔓 O Que é DES em GRF?

DES (Data Encryption Standard) é uma criptografia que pode ser aplicada aos arquivos GRF do Ragnarok Online. Quando presente:

- Os dados dentro do GRF ficam **criptografados**
- A chave de criptografia fica armazenada no **header do arquivo** (bytes 15-28)
- Bibliotecas modernas como `@chicowall/grf-loader` **não suportam DES**
- É necessário **remover a criptografia** para usar com este projeto

## 🔍 Como Detectar se um GRF Tem DES

### Método 1: Usar o comando `npm run doctor`

```bash
npm run doctor
```

Vai mostrar:
```
❌ GRF incompatível: data.grf
  ❌ Criptografia DES: SIM (esperado: NÃO)
```

### Método 2: Verificar Manualmente (Hex Editor)

1. Abra o arquivo .grf em um editor hexadecimal
2. Olhe os bytes no offset **15-28** (14 bytes)
3. Se **todos forem 0x00** → Sem DES ✅
4. Se **algum byte for diferente de 0** → Com DES ❌

**Exemplo sem DES:**
```
Offset 0x00: 4D 61 73 74 65 72 20 6F 66 20 4D 61 67 69 63  Master of Magic
Offset 0x0F: 00 00 00 00 00 00 00 00 00 00 00 00 00 00     ← TODOS ZEROS = SEM DES
```

**Exemplo com DES:**
```
Offset 0x00: 4D 61 73 74 65 72 20 6F 66 20 4D 61 67 69 63  Master of Magic
Offset 0x0F: A3 5F 2C 89 4B 7E 91 D2 3A 8C 6F 45 B7 1E     ← BYTES DIFERENTES = COM DES
```

## 🛠️ Ferramentas para Remover DES

### **GRF Builder/Editor** (Recomendado) ⭐

**Download:** https://github.com/Tokeiburu/GRFEditor

#### Passo a Passo:

1. **Baixe e instale** o GRF Builder/Editor

2. **Abra o programa**

3. **Abra seu arquivo GRF:**
   - File → Open
   - Selecione seu arquivo (ex: data.grf)

4. **Configure o tipo de repack:**
   - File → Options (ou Settings)
   - Procure por: **Repack type**
   - Selecione: **Decrypt** ✅

5. **Execute o repack:**
   - Tools → Repack
   - Aguarde a conclusão (pode demorar alguns minutos)
   - O arquivo será reescrito sem criptografia DES

6. **Verifique o resultado:**
   ```bash
   npm run doctor
   ```

#### Capturas de Tela:

```
┌─────────────────────────────────────┐
│  GRF Builder - Options              │
├─────────────────────────────────────┤
│  Repack type:                       │
│  ( ) Keep encryption                │
│  (•) Decrypt           ← SELECIONAR │
│  ( ) Encrypt with key               │
│                                     │
│  [OK]  [Cancel]                     │
└─────────────────────────────────────┘
```

### Alternativa: GRF Tool (Linha de Comando)

Se preferir linha de comando, existe a ferramenta **grf-tools**:

```bash
# Instalação (Python)
pip install grf-tools

# Remover DES de um GRF
grf-tool decrypt data.grf data_decrypted.grf

# Substituir o original
mv data_decrypted.grf data.grf
```

## 🔬 Validação Técnica (Como o Código Funciona)

O validador implementado lê o header do GRF e verifica:

### Estrutura do Header GRF (46 bytes):

```
Offset | Tamanho | Descrição                  | Valor Esperado
-------|---------|----------------------------|------------------
0-14   | 15 bytes| Magic String               | "Master of Magic"
15-28  | 14 bytes| Chave de Criptografia DES  | [00 00 ... 00] (todos zeros)
29-41  | 13 bytes| Outros dados               | Variável
42-45  | 4 bytes | Versão (little-endian)     | 0x00020000 (0x200)
```

### Código de Validação:

```javascript
// Ler chave de criptografia (bytes 15-28)
const encryptionKey = buffer.slice(15, 29);  // 14 bytes

// Verificar se TODOS os bytes são zero
const hasEncryption = !encryptionKey.every(byte => byte === 0);

// Resultado:
// hasEncryption = false → Sem DES ✅
// hasEncryption = true  → Com DES ❌
```

### Lógica Simplificada:

```
SE encryption_key == [00 00 00 00 00 00 00 00 00 00 00 00 00 00]
  ENTÃO: Sem DES ✅
SENÃO
  ENTÃO: Com DES ❌
FIM SE
```

## ❓ Por Que Remover DES?

1. **Incompatibilidade**: A biblioteca `@chicowall/grf-loader` não suporta DES
2. **Performance**: GRF sem criptografia é mais rápido para ler
3. **Desnecessário**: Para servidor web, a criptografia DES não adiciona segurança real
4. **Padrão moderno**: Servidores RO modernos usam GRF sem DES

## 🎯 Resumo

| Item                  | Valor             |
|-----------------------|-------------------|
| Versão GRF suportada  | 0x200             |
| Criptografia DES      | NÃO (removida)    |
| Ferramenta            | GRF Builder       |
| Comando               | Repack → Decrypt  |
| Validação             | `npm run doctor`  |

## 🔗 Links Úteis

- **GRF Builder/Editor:** https://github.com/Tokeiburu/GRFEditor
- **Biblioteca GRF Loader:** https://www.npmjs.com/package/@chicowall/grf-loader
- **Documentação roBrowser:** https://github.com/MrAntares/roBrowserLegacy

---

**Dica:** Sempre faça backup dos seus arquivos GRF originais antes de reempacotar! 💾
