import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

export type CardType = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';

export interface PaymentCard {
    id: string;
    holderName: string;
    number: string; // Storing full number for demo purposes, usually only token/last4
    expiry: string;
    cvc: string;
    type: CardType;
    isDefault: boolean;
    color?: string; // For UI customization
}

type PaymentContextType = {
    cards: PaymentCard[];
    addCard: (card: Omit<PaymentCard, 'id' | 'isDefault'>) => Promise<void>;
    removeCard: (id: string) => Promise<void>;
    setDefaultCard: (id: string) => Promise<void>;
    isLoading: boolean;
};

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

const STORAGE_KEY = 'user_payment_cards';

export const PaymentProvider = ({ children }: { children: React.ReactNode }) => {
    const [cards, setCards] = useState<PaymentCard[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadCards();
    }, []);

    const loadCards = async () => {
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                setCards(JSON.parse(stored));
            }
        } catch (e) {
            console.warn('Failed to load cards', e);
        } finally {
            setIsLoading(false);
        }
    };

    const saveCards = async (newCards: PaymentCard[]) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newCards));
            setCards(newCards);
        } catch (e) {
            console.warn('Failed to save cards', e);
        }
    };

    const addCard = async (cardData: Omit<PaymentCard, 'id' | 'isDefault'>) => {
        const newCard: PaymentCard = {
            ...cardData,
            id: Math.random().toString(36).substr(2, 9),
            isDefault: cards.length === 0, // First card is default
        };
        await saveCards([...cards, newCard]);
    };

    const removeCard = async (id: string) => {
        const newCards = cards.filter(c => c.id !== id);
        // If we removed the default card, set the first available as default
        if (newCards.length > 0 && !newCards.some(c => c.isDefault)) {
            newCards[0].isDefault = true;
        }
        await saveCards(newCards);
    };

    const setDefaultCard = async (id: string) => {
        const newCards = cards.map(c => ({
            ...c,
            isDefault: c.id === id
        }));
        await saveCards(newCards);
    };

    return (
        <PaymentContext.Provider value={{ cards, addCard, removeCard, setDefaultCard, isLoading }}>
            {children}
        </PaymentContext.Provider>
    );
};

export const usePayment = () => {
    const context = useContext(PaymentContext);
    if (context === undefined) {
        throw new Error('usePayment must be used within a PaymentProvider');
    }
    return context;
};
