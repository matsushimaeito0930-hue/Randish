import { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * 予期しない例外でアプリ全体が真っ白になるのを防ぐ。
 * React 19 は捕捉されない例外でルートごとアンマウントするため、
 * ここで受け止めて「再読み込み」できる画面を出す。
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RANDISH] uncaught UI error', error, info?.componentStack);
  }

  private handleReload = () => {
    const runtimeGlobal = globalThis as typeof globalThis & {
      location?: { reload?: () => void };
    };
    if (runtimeGlobal.location?.reload) {
      runtimeGlobal.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <View style={{ flex: 1, backgroundColor: '#fff8f1', padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: '#16130f' }}>
          読み込みでエラーが起きました
        </Text>
        <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 21, fontWeight: '700', color: '#6d6258' }}>
          通信状況が不安定な可能性があります。もう一度読み込むと表示できることがあります。
        </Text>
        <Pressable
          onPress={this.handleReload}
          style={{
            marginTop: 20,
            minHeight: 50,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 25,
            backgroundColor: '#f05a28',
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '900', color: '#ffffff' }}>もう一度読み込む</Text>
        </Pressable>
        <ScrollView style={{ marginTop: 18, maxHeight: 160 }}>
          <Text style={{ fontSize: 11, lineHeight: 16, color: '#9a9187' }}>
            {String(error?.message ?? error)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
